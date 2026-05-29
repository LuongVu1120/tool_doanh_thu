/**
 * Sync flow Sapo first-class:
 *   1) syncSapoMembers: pull /admin/users.json → upsert sapo_members
 *   2) syncSapoOrders : pull /admin/orders.json (paginated) → upsert sapo_orders
 *                       + discover channels từ channel_definition của mỗi đơn
 *                       + resolve channel_id cho từng order.
 *
 * Throttle: Sapo bucket 40, leak 2/s. Ta giới hạn 1 req/0.6s (~1.67 req/s) cho an toàn.
 */
import type { SupabaseClient } from '@supabase/supabase-js'
import {
  fetchAllSapoUsers,
  fetchSapoOrdersCount,
  fetchSapoOrdersPage,
  sleep,
  type SapoV2Auth,
} from './client'
import {
  extractChannelFromOrder,
  normalizeSapoOrder,
  normalizeSapoUser,
} from './normalize'
import type {
  SapoApiOrder,
  SapoChannelRow,
  SapoSyncStats,
} from './types'

const THROTTLE_MS = 600 // ~1.67 req/s, an toàn dưới leak rate 2/s
const SAPO_MAX_RESULT_WINDOW = 30000 // Sapo: page × limit ≤ 30,000
const SAFE_WINDOW_SIZE = 25000 // chừa biên độ an toàn

/**
 * Generate time windows từ start → end (mặc định: theo tháng dương lịch).
 * Trả về array các [startISO, endISO] không overlap.
 */
function generateMonthlyWindows(start: Date, end: Date): Array<[string, string]> {
  const windows: Array<[string, string]> = []
  const cur = new Date(start.getFullYear(), start.getMonth(), 1)
  while (cur <= end) {
    const nextMonth = new Date(cur.getFullYear(), cur.getMonth() + 1, 1)
    const winStart = cur < start ? start : cur
    const winEnd = nextMonth > end ? end : nextMonth
    windows.push([winStart.toISOString(), winEnd.toISOString()])
    cur.setMonth(cur.getMonth() + 1)
  }
  return windows
}

/**
 * Chia 1 window làm đôi (theo midpoint thời gian) khi count > SAFE_WINDOW_SIZE.
 */
function splitWindow(startIso: string, endIso: string): Array<[string, string]> {
  const start = new Date(startIso).getTime()
  const end = new Date(endIso).getTime()
  const mid = new Date(Math.floor((start + end) / 2)).toISOString()
  return [[startIso, mid], [mid, endIso]]
}

export interface SyncSapoMembersResult {
  total: number
  upserted: number
}

export async function syncSapoMembers(
  supabase: SupabaseClient,
  auth: SapoV2Auth
): Promise<SyncSapoMembersResult> {
  const { users } = await fetchAllSapoUsers(auth)
  if (users.length === 0) return { total: 0, upserted: 0 }

  const now = new Date().toISOString()
  const rows = users.map((u) => normalizeSapoUser(u, now))

  // Batch upsert theo lô 500 để tránh PayloadTooLarge
  let upserted = 0
  for (let i = 0; i < rows.length; i += 500) {
    const batch = rows.slice(i, i + 500)
    const { error } = await supabase
      .from('sapo_members')
      .upsert(batch, { onConflict: 'sapo_user_id' })
    if (error) throw new Error(`upsert sapo_members: ${error.message}`)
    upserted += batch.length
  }

  return { total: users.length, upserted }
}

export interface SyncSapoOrdersOptions {
  /** Nếu set, chỉ sync đơn được tạo từ thời điểm này (ISO). */
  createdOnMin?: string | null
  /** Sync incremental theo modified_on (đè createdOnMin nếu cùng truyền). */
  modifiedOnMin?: string | null
  /** Số đơn tối đa cần sync (an toàn cho lần test đầu). Mặc định: không giới hạn. */
  maxOrders?: number
  /** Page size (mặc định 250 - max của Sapo). */
  pageSize?: number
  /** Callback gọi sau mỗi page (cho progress UI). */
  onProgress?: (info: { page: number; totalPages: number; fetched: number; total: number; rateLimit: string | null }) => void
}

export async function syncSapoOrders(
  supabase: SupabaseClient,
  auth: SapoV2Auth,
  options: SyncSapoOrdersOptions = {}
): Promise<SapoSyncStats> {
  const t0 = Date.now()
  const pageSize = options.pageSize ?? 250

  // ===== Pre-load member IDs để check FK =====
  const knownMemberIds = new Set<number>()
  {
    let offset = 0
    while (true) {
      const { data } = await supabase
        .from('sapo_members')
        .select('sapo_user_id')
        .range(offset, offset + 999)
      if (!data || data.length === 0) break
      for (const r of data) knownMemberIds.add(r.sapo_user_id as number)
      if (data.length < 1000) break
      offset += 1000
    }
  }

  const channelKeyToId = new Map<string, string>()
  const discoveredChannelIds = new Set<string>()
  let lastRateLimit: string | null = null
  let cursorModifiedOn: string | null = null
  let pagesFetched = 0
  let totalOrdersFetched = 0
  let totalOrdersUpserted = 0
  let totalStubMembersCreated = 0

  // ===== Sapo có giới hạn page × limit ≤ 30,000 cho mỗi query =====
  // → Phải chia thời gian thành các cửa sổ <= 25k đơn. Dùng cửa sổ tháng + auto-split nếu cần.
  const start = options.createdOnMin ? new Date(options.createdOnMin) : new Date('2020-01-01')
  const end = new Date()
  const windows: Array<[string, string]> = options.modifiedOnMin
    ? [[options.modifiedOnMin, end.toISOString()]] // incremental dùng modified_on (số đơn nhỏ)
    : generateMonthlyWindows(start, end)

  // Auto-split những cửa sổ có > SAFE_WINDOW_SIZE đơn (đệ quy nhị phân)
  const pending: Array<[string, string]> = [...windows]
  const finalWindows: Array<{ from: string; to: string; count: number; useModified: boolean }> = []
  while (pending.length > 0) {
    const [winStart, winEnd] = pending.shift()!
    const useModified = !!options.modifiedOnMin
    const count = await fetchSapoOrdersCount({
      auth,
      createdOnMin: useModified ? null : winStart,
      createdOnMax: useModified ? null : winEnd,
      modifiedOnMin: useModified ? winStart : null,
      modifiedOnMax: useModified ? winEnd : null,
    })
    if (count === 0) continue
    if (count > SAFE_WINDOW_SIZE) {
      pending.push(...splitWindow(winStart, winEnd))
      continue
    }
    finalWindows.push({ from: winStart, to: winEnd, count, useModified })
    await sleep(300)
  }
  finalWindows.sort((a, b) => a.from.localeCompare(b.from))

  const effectiveTotal = options.maxOrders
    ? Math.min(finalWindows.reduce((s, w) => s + w.count, 0), options.maxOrders)
    : finalWindows.reduce((s, w) => s + w.count, 0)

  // ===== Loop qua từng window và paginate trong từng window =====
  const nowIso = () => new Date().toISOString()

  outer: for (let wIdx = 0; wIdx < finalWindows.length; wIdx++) {
    const win = finalWindows[wIdx]
    const winLabel = `${win.from.slice(0, 10)}→${win.to.slice(0, 10)}`
    const winPages = Math.ceil(win.count / pageSize)

    for (let page = 1; page <= winPages; page++) {
      if (page * pageSize > SAPO_MAX_RESULT_WINDOW) break // safety net

      let resp
      try {
        resp = await fetchSapoOrdersPage({
          auth,
          page,
          limit: pageSize,
          createdOnMin: win.useModified ? null : win.from,
          createdOnMax: win.useModified ? null : win.to,
          modifiedOnMin: win.useModified ? win.from : null,
          modifiedOnMax: win.useModified ? win.to : null,
        })
      } catch (err) {
        const st = (err as Error & { status?: number }).status
        if (st === 429) {
          await sleep(5000)
          page--
          continue
        }
        throw err
      }
      pagesFetched++
      lastRateLimit = resp.rateLimit
      const orders: SapoApiOrder[] = resp.json?.orders || []
      if (orders.length === 0) break

      // ----- Discover NEW channels -----
      const newChannelEntries: Array<[string, SapoChannelRow]> = []
      for (const o of orders) {
        const ch = extractChannelFromOrder(o)
        if (ch && !channelKeyToId.has(ch.key)) {
          newChannelEntries.push([ch.key, ch.row])
          channelKeyToId.set(ch.key, '__pending__')
        }
      }
      if (newChannelEntries.length > 0) {
        for (const [k] of newChannelEntries) channelKeyToId.delete(k)
        const resolved = await upsertChannelsAndResolve(supabase, newChannelEntries)
        for (const [k, id] of resolved) {
          channelKeyToId.set(k, id)
          discoveredChannelIds.add(id)
        }
      }

      // ----- Auto-insert stub members -----
      const missingMemberIds = new Set<number>()
      for (const o of orders) {
        const cid = o.user_id ? Number(o.user_id) : null
        const aid = o.assignee_id ? Number(o.assignee_id) : null
        if (cid && !knownMemberIds.has(cid)) missingMemberIds.add(cid)
        if (aid && !knownMemberIds.has(aid)) missingMemberIds.add(aid)
      }
      if (missingMemberIds.size > 0) {
        const ts = nowIso()
        const stubs = [...missingMemberIds].map((id) => ({
          sapo_user_id: id,
          full_name: `(Đã rời công ty #${id})`,
          is_active: false,
          last_synced_at: ts,
        }))
        const { error: stubError } = await supabase
          .from('sapo_members')
          .upsert(stubs, { onConflict: 'sapo_user_id', ignoreDuplicates: true })
        if (stubError) throw new Error(`upsert stub members (win ${winLabel} p${page}): ${stubError.message}`)
        for (const id of missingMemberIds) knownMemberIds.add(id)
        totalStubMembersCreated += missingMemberIds.size
      }

      // ----- Normalize + upsert orders -----
      const pageRows = orders.map((o) => normalizeSapoOrder(o, auth.store))
      totalOrdersFetched += pageRows.length

      const rowsForDb = pageRows.map((row) => ({
        sapo_order_id: row.sapo_order_id,
        order_number: row.order_number,
        store: row.store,
        creator_member_id: row.creator_member_id,
        assignee_member_id: row.assignee_member_id,
        channel_id: row.channel_key ? channelKeyToId.get(row.channel_key) ?? null : null,
        sapo_location_id: row.sapo_location_id,
        platform: row.platform,
        status: row.status,
        financial_status: row.financial_status,
        fulfillment_status: row.fulfillment_status,
        total_price: row.total_price,
        total_received: row.total_received,
        total_refunded: row.total_refunded,
        currency: row.currency,
        created_on: row.created_on,
        modified_on: row.modified_on,
        processed_on: row.processed_on,
        cancelled_on: row.cancelled_on,
        paid_on: row.paid_on,
        source_name: row.source_name,
        landing_site: row.landing_site,
        utm_campaign: row.utm_campaign,
        utm_source: row.utm_source,
        utm_medium: row.utm_medium,
        tags: row.tags,
        raw: row.raw as unknown as Record<string, unknown>,
        last_synced_at: nowIso(),
      }))

      for (let i = 0; i < rowsForDb.length; i += 500) {
        const batch = rowsForDb.slice(i, i + 500)
        const { error } = await supabase
          .from('sapo_orders')
          .upsert(batch, { onConflict: 'sapo_order_id' })
        if (error) throw new Error(`upsert sapo_orders (win ${winLabel} p${page}): ${error.message}`)
        totalOrdersUpserted += batch.length
      }

      for (const row of pageRows) {
        if (row.modified_on && (!cursorModifiedOn || row.modified_on > cursorModifiedOn)) {
          cursorModifiedOn = row.modified_on
        }
      }

      options.onProgress?.({
        page,
        totalPages: winPages,
        fetched: totalOrdersFetched,
        total: effectiveTotal,
        rateLimit: lastRateLimit,
      })

      if (options.maxOrders && totalOrdersFetched >= options.maxOrders) break outer
      if (page < winPages) await sleep(THROTTLE_MS)
    }

    // Gap nhỏ giữa các window
    if (wIdx < finalWindows.length - 1) await sleep(300)
  }

  // ===== Refresh denormalized orders_count =====
  await refreshChannelOrderCounts(supabase, [...discoveredChannelIds])

  // ===== Update sync state =====
  await supabase
    .from('sapo_sync_state')
    .upsert(
      {
        store: auth.store,
        orders_last_sync_at: nowIso(),
        orders_cursor_modified_on: cursorModifiedOn,
        total_orders_synced: totalOrdersUpserted,
        total_channels_discovered: discoveredChannelIds.size,
      },
      { onConflict: 'store' }
    )

  return {
    members_synced: totalStubMembersCreated,
    channels_discovered: discoveredChannelIds.size,
    orders_fetched: totalOrdersFetched,
    orders_upserted: totalOrdersUpserted,
    pages_fetched: pagesFetched,
    rate_limit_last: lastRateLimit,
    cursor_modified_on: cursorModifiedOn,
    elapsed_ms: Date.now() - t0,
  }
}

function makeChannelKey(alias: string, branchExternalId: string | null, branchName: string | null): string {
  return `${alias}::${branchExternalId || branchName || 'default'}`
}

/**
 * Tránh ON CONFLICT vì partial unique indexes không tương thích với PostgREST `onConflict` option.
 * Pattern: SELECT existing → INSERT only mới → UPDATE last_seen_at cho existing.
 */
async function upsertChannelsAndResolve(
  supabase: SupabaseClient,
  entries: Array<[string, SapoChannelRow]>
): Promise<Map<string, string>> {
  const keyToId = new Map<string, string>()
  if (entries.length === 0) return keyToId

  const now = new Date().toISOString()
  const aliasSet = [...new Set(entries.map(([_, row]) => row.alias))]

  const { data: existing, error: selectError } = await supabase
    .from('sapo_channels')
    .select('id, alias, branch_name, branch_external_id')
    .in('alias', aliasSet)
  if (selectError) throw new Error(`select sapo_channels: ${selectError.message}`)

  const existingByKey = new Map<string, string>()
  for (const r of existing || []) {
    const k = makeChannelKey(r.alias, r.branch_external_id, r.branch_name)
    existingByKey.set(k, r.id)
  }

  const toInsert: Record<string, unknown>[] = []
  const existingIdsTouched: string[] = []
  for (const [key, row] of entries) {
    const existingId = existingByKey.get(key)
    if (existingId) {
      keyToId.set(key, existingId)
      existingIdsTouched.push(existingId)
    } else {
      toInsert.push({
        alias: row.alias,
        main_name: row.main_name,
        sub_name: row.sub_name,
        branch_name: row.branch_name,
        branch_external_id: row.branch_external_id,
        platform: row.platform,
        app_alias: row.app_alias,
        last_seen_at: now,
      })
    }
  }

  if (toInsert.length > 0) {
    const { data: inserted, error: insertError } = await supabase
      .from('sapo_channels')
      .insert(toInsert)
      .select('id, alias, branch_name, branch_external_id')
    if (insertError) throw new Error(`insert sapo_channels: ${insertError.message}`)
    for (const r of inserted || []) {
      const k = makeChannelKey(r.alias, r.branch_external_id, r.branch_name)
      keyToId.set(k, r.id)
    }
  }

  if (existingIdsTouched.length > 0) {
    const uniqueIds = [...new Set(existingIdsTouched)]
    await supabase
      .from('sapo_channels')
      .update({ last_seen_at: now })
      .in('id', uniqueIds)
  }

  return keyToId
}

async function refreshChannelOrderCounts(supabase: SupabaseClient, channelIds: string[]): Promise<void> {
  if (channelIds.length === 0) return
  // Đếm lại orders_count cho từng channel. Dùng RPC sẽ tối ưu hơn nhưng tạm dùng JS.
  for (const id of channelIds) {
    const { count } = await supabase
      .from('sapo_orders')
      .select('sapo_order_id', { count: 'exact', head: true })
      .eq('channel_id', id)
    if (count !== null) {
      await supabase
        .from('sapo_channels')
        .update({ orders_count: count })
        .eq('id', id)
    }
  }
}
