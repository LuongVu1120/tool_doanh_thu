/**
 * Auto-assign Sapo traffic channel owners from order-level signals.
 *
 * Default is dry-run. Use --apply to update sapo_channels.media_member_id.
 *
 * Signals used:
 * - tags like "Thanh ADS", "Viet ADS" (accent-insensitive)
 * - utm_campaign ending with a media member name, e.g. "... - Thanh"
 * - channel/page name containing a clear media member name
 *
 * Conservative by design:
 * - only empty channels are assigned unless --overwrite is passed
 * - channels with mixed owner signals are skipped
 * - POS/marketplace channels with no owner signal are skipped
 */

import { createClient } from '@supabase/supabase-js'
import fs from 'fs'
import path from 'path'

const APPLY = process.argv.includes('--apply')
const OVERWRITE = process.argv.includes('--overwrite')
const MIN_SIGNALS = Number(readArg('--min-signals') || 5)
const MIN_SHARE = Number(readArg('--min-share') || 0.7)

function readArg(name) {
  const idx = process.argv.indexOf(name)
  if (idx < 0) return null
  return process.argv[idx + 1] || null
}

function loadEnv() {
  const envPath = path.resolve('.env')
  const env = {}
  for (const line of fs.readFileSync(envPath, 'utf8').split(/\r?\n/)) {
    if (!line || line.trim().startsWith('#')) continue
    const [key, ...rest] = line.split('=')
    if (!key) continue
    env[key.trim()] = rest.join('=').trim().replace(/^"|"$/g, '')
  }
  return env
}

function normalize(value) {
  return String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/đ/g, 'd')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
}

function hasPhrase(text, phrase) {
  if (!text || !phrase) return false
  return ` ${text} `.includes(` ${phrase} `)
}

function memberAliases(member) {
  const full = normalize(member.full_name)
  const parts = full.split(' ').filter(Boolean)
  const aliases = new Set()

  if (member.prefix_code) aliases.add(normalize(member.prefix_code))
  if (parts.length > 0) aliases.add(parts[parts.length - 1])

  // Common short names seen in Sapo tags/UTM.
  const explicit = {
    764388: ['thanh', 'thanh ads', 'ads thanh'],
    764389: ['viet', 'viet ads', 'ads viet'],
    848478: ['anh'],
    760580: ['van'],
    760993: ['linh'],
    756654: ['nga'],
    765712: ['hien', 'koc hien'],
    761331: ['trang'],
    761008: ['dung'],
    786004: ['bac'],
  }
  for (const alias of explicit[member.sapo_user_id] || []) aliases.add(normalize(alias))

  return [...aliases].filter((a) => a.length >= 2)
}

function extractOrderSignals(order, aliasToMemberId) {
  const found = []
  const textTags = normalize(order.tags)
  const textUtm = normalize(order.utm_campaign)

  for (const [alias, memberId] of aliasToMemberId.entries()) {
    if (hasPhrase(textTags, `${alias} ads`) || hasPhrase(textTags, `ads ${alias}`)) {
      found.push({ memberId, source: 'tag_ads' })
    }
  }

  if (textUtm) {
    const pieces = textUtm.split(' ').filter(Boolean)
    const last = pieces[pieces.length - 1]
    const memberId = aliasToMemberId.get(last)
    if (memberId) found.push({ memberId, source: 'utm_tail' })
  }

  return found
}

function extractChannelNameSignal(channel, aliasToMemberId) {
  const text = normalize([channel.branch_name, channel.main_name, channel.sub_name].filter(Boolean).join(' '))
  if (!text) return null

  for (const [alias, memberId] of aliasToMemberId.entries()) {
    const padded = ` ${text} `
    if (padded.includes(` ${alias} `) && !['web', 'pos', 'zalo'].includes(alias)) {
      return { memberId, source: 'channel_name' }
    }
  }
  return null
}

async function fetchAll(supabase, table, select, orderColumn = null) {
  const pageSize = 1000
  let from = 0
  const rows = []
  while (true) {
    let query = supabase.from(table).select(select).range(from, from + pageSize - 1)
    if (orderColumn) query = query.order(orderColumn, { ascending: true })
    const { data, error } = await query
    if (error) throw new Error(`${table}: ${error.message}`)
    rows.push(...(data || []))
    if (!data || data.length < pageSize) break
    from += pageSize
  }
  return rows
}

function addSignal(stats, memberId, source, order) {
  if (!stats.byMember.has(memberId)) {
    stats.byMember.set(memberId, { signals: 0, paidRevenue: 0, sources: new Map() })
  }
  const row = stats.byMember.get(memberId)
  row.signals += 1
  row.sources.set(source, (row.sources.get(source) || 0) + 1)
  if (order?.financial_status === 'paid' && order?.status !== 'cancelled') {
    row.paidRevenue += Number(order.total_price) || 0
  }
  stats.totalSignals += 1
}

const env = loadEnv()
const supabase = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
})

console.log(`Mode: ${APPLY ? 'APPLY' : 'DRY-RUN'}`)
console.log(`Options: overwrite=${OVERWRITE}, minSignals=${MIN_SIGNALS}, minShare=${MIN_SHARE}`)

const [members, channels, orders] = await Promise.all([
  fetchAll(supabase, 'sapo_members', 'sapo_user_id, full_name, prefix_code, is_media_team'),
  fetchAll(
    supabase,
    'sapo_channels',
    'id, alias, platform, branch_name, branch_external_id, main_name, sub_name, orders_count, media_member_id',
  ),
  fetchAll(
    supabase,
    'sapo_orders',
    'sapo_order_id, channel_id, status, financial_status, total_price, tags, utm_campaign',
    'sapo_order_id',
  ),
])

const mediaMembers = members.filter((m) => m.is_media_team)
const memberById = new Map(members.map((m) => [m.sapo_user_id, m]))
const channelById = new Map(channels.map((c) => [c.id, c]))
const aliasToMemberId = new Map()

for (const member of mediaMembers) {
  for (const alias of memberAliases(member)) {
    if (!aliasToMemberId.has(alias)) aliasToMemberId.set(alias, member.sapo_user_id)
  }
}

const statsByChannel = new Map(
  channels.map((channel) => [
    channel.id,
    {
      totalSignals: 0,
      byMember: new Map(),
      ordersSeen: 0,
    },
  ]),
)

for (const order of orders) {
  if (!order.channel_id) continue
  const stats = statsByChannel.get(order.channel_id)
  if (!stats) continue
  stats.ordersSeen += 1
  for (const signal of extractOrderSignals(order, aliasToMemberId)) {
    addSignal(stats, signal.memberId, signal.source, order)
  }
}

for (const channel of channels) {
  const stats = statsByChannel.get(channel.id)
  if (!stats || stats.totalSignals > 0) continue
  const signal = extractChannelNameSignal(channel, aliasToMemberId)
  if (signal) addSignal(stats, signal.memberId, signal.source, null)
}

const decisions = []
for (const channel of channels) {
  if (!OVERWRITE && channel.media_member_id !== null) continue

  const stats = statsByChannel.get(channel.id)
  const ranked = [...(stats?.byMember.entries() || [])]
    .map(([memberId, row]) => ({
      memberId,
      memberName: memberById.get(memberId)?.full_name || `#${memberId}`,
      signals: row.signals,
      share: stats.totalSignals > 0 ? row.signals / stats.totalSignals : 0,
      paidRevenue: row.paidRevenue,
      sources: Object.fromEntries(row.sources.entries()),
    }))
    .sort((a, b) => b.signals - a.signals || b.paidRevenue - a.paidRevenue)

  const top = ranked[0] || null
  const mixed = ranked.length > 1 && top && ranked[1].signals > 0
  let action = 'skip'
  let reason = 'no_owner_signal'

  if (top && channel.platform !== 'facebook') {
    reason = 'non_facebook_channel_needs_order_rule'
  } else if (top && stats.totalSignals >= MIN_SIGNALS && top.share >= MIN_SHARE) {
    action = 'assign'
    reason = mixed ? 'dominant_owner_signal' : 'clear_owner_signal'
  } else if (top && stats.totalSignals > 0) {
    reason = mixed ? 'mixed_owner_signal' : 'weak_owner_signal'
  } else if (['pos', 'tiktok', 'shopee'].includes(channel.platform)) {
    reason = 'platform_needs_business_rule'
  }

  decisions.push({
    action,
    reason,
    channel_id: channel.id,
    channel_name: channel.branch_name || channel.alias,
    platform: channel.platform,
    orders_count: channel.orders_count,
    current_member_id: channel.media_member_id,
    suggested_member_id: top?.memberId || null,
    suggested_member_name: top?.memberName || null,
    signal_count: stats?.totalSignals || 0,
    signal_share: top ? Number((top.share * 100).toFixed(1)) : 0,
    paid_revenue_by_signal: top?.paidRevenue || 0,
    sources: top?.sources || {},
    alternatives: ranked.slice(1, 4).map((r) => ({
      member_id: r.memberId,
      member_name: r.memberName,
      signals: r.signals,
      share: Number((r.share * 100).toFixed(1)),
    })),
  })
}

const assignments = decisions.filter((d) => d.action === 'assign')
const skipped = decisions.filter((d) => d.action !== 'assign')

console.log(`Loaded: ${members.length} members, ${mediaMembers.length} media members, ${channels.length} channels, ${orders.length} orders`)
console.log(`Candidates: ${decisions.length}, assignments: ${assignments.length}, skipped: ${skipped.length}`)

if (assignments.length > 0) {
  console.table(
    assignments.map((d) => ({
      channel: d.channel_name,
      platform: d.platform,
      orders: d.orders_count,
      owner: d.suggested_member_name,
      signals: d.signal_count,
      share: `${d.signal_share}%`,
      reason: d.reason,
    })),
  )
}

const reportDir = path.resolve('outputs', 'traffic-mapping')
fs.mkdirSync(reportDir, { recursive: true })
const reportPath = path.join(reportDir, `auto_assign_traffic_channels_${new Date().toISOString().slice(0, 10)}.json`)
fs.writeFileSync(
  reportPath,
  JSON.stringify(
    {
      generated_at: new Date().toISOString(),
      mode: APPLY ? 'apply' : 'dry-run',
      options: { overwrite: OVERWRITE, min_signals: MIN_SIGNALS, min_share: MIN_SHARE },
      summary: {
        media_members: mediaMembers.length,
        channels: channels.length,
        orders: orders.length,
        candidates: decisions.length,
        assignments: assignments.length,
        skipped: skipped.length,
      },
      assignments,
      skipped,
    },
    null,
    2,
  ),
)
console.log(`Report: ${reportPath}`)

if (!APPLY) {
  console.log('Dry-run only. Run with --apply to update sapo_channels.media_member_id.')
  process.exit(0)
}

let ok = 0
let failed = 0
for (const assignment of assignments) {
  const current = channelById.get(assignment.channel_id)
  if (!current) continue
  if (!OVERWRITE && current.media_member_id !== null) continue

  const { error } = await supabase
    .from('sapo_channels')
    .update({ media_member_id: assignment.suggested_member_id })
    .eq('id', assignment.channel_id)

  if (error) {
    failed += 1
    console.log(`FAILED ${assignment.channel_name}: ${error.message}`)
  } else {
    ok += 1
  }
}

console.log(`Applied: ${ok} channel assignments, failed: ${failed}`)
