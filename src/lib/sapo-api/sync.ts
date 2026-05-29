import { buildOrderImportRows, loadActiveMappingLookup } from '@/lib/revenue/order-import'
import type { TypedSupabaseClient } from '@/lib/supabase/types'
import { fetchSapoOrders } from './client'
import { normalizeSapoOrder } from './normalize'
import type { SapoConnection, SapoOrderResponse } from './types'

const SYNC_OVERLAP_MINUTES = 10

export interface SapoSyncResult {
  connectionId: string
  store: string
  fetched: number
  upserted: number
  newOrders: number
  statusChanged: number
  cursor: string | null
}

export async function syncSapoConnection(
  supabase: TypedSupabaseClient,
  connection: SapoConnection,
  options: { full?: boolean } = {}
): Promise<SapoSyncResult> {
  const modifiedOnMin = options.full ? null : getOverlappedCursor(connection.sync_cursor_modified_on)
  const fetchedOrders: SapoOrderResponse[] = []
  let page = 1

  while (page <= 100) {
    const response = await fetchSapoOrders({
      store: connection.store,
      accessToken: connection.access_token,
      apiKey: connection.api_key ?? null,
      apiSecret: connection.api_secret ?? null,
      page,
      limit: 250,
      modifiedOnMin,
    })
    const orders = response.orders || []
    fetchedOrders.push(...orders)
    if (orders.length < 250) break
    page++
  }

  return ingestSapoOrders(supabase, connection, fetchedOrders)
}

export async function ingestSapoOrders(
  supabase: TypedSupabaseClient,
  connection: SapoConnection,
  orders: SapoOrderResponse[]
): Promise<SapoSyncResult> {
  const normalized = orders.map(normalizeSapoOrder).filter((item) => item.rawRow.orderCode)
  const metadataByOrderCode = new Map(
    normalized.map((item) => [item.rawRow.orderCode!, item.meta])
  )
  const rawRows = normalized.map((item) => item.rawRow)
  const orderCodes = rawRows.map((row) => row.orderCode).filter(Boolean) as string[]

  const { data: existingOrders } = orderCodes.length > 0
    ? await supabase.from('orders').select('order_code, status').in('order_code', orderCodes)
    : { data: [] as Array<{ order_code: string; status: string | null }> }

  const existingOrderCodes = new Set((existingOrders || []).map((row) => row.order_code))
  const existingStatusByCode = new Map((existingOrders || []).map((row) => [row.order_code, row.status]))
  const mappingLookup = await loadActiveMappingLookup(supabase)
  const { rows: orderRows } = await buildOrderImportRows(rawRows, {
    mappingLookup,
    metadataByOrderCode,
  })

  const { data: importRecord } = await supabase
    .from('revenue_imports')
    .insert({
      uploaded_by: connection.connected_by,
      file_name: `sapo:${connection.store}`,
      file_type: 'orders',
      status: 'processing',
      total_rows_in_file: orders.length,
      total_orders_processed: orderRows.length,
    })
    .select('id')
    .single()

  if (orderRows.length > 0) {
    const { error } = await supabase
      .from('orders')
      .upsert(orderRows, { onConflict: 'order_code' })
    if (error) {
      if (importRecord?.id) {
        await supabase
          .from('revenue_imports')
          .update({ status: 'error', error_message: error.message })
          .eq('id', importRecord.id)
      }
      throw error
    }
  }

  const cursor = maxModifiedOn(orders)
  const now = new Date().toISOString()
  if (connection.source !== 'env') {
    await supabase
      .from('sapo_connections')
      .update({
        last_sync_at: now,
        sync_cursor_modified_on: cursor ?? connection.sync_cursor_modified_on ?? now,
        updated_at: now,
      })
      .eq('id', connection.id)
  }

  const newOrders = orderRows.filter((row) => !existingOrderCodes.has(row.order_code)).length
  const statusChanged = orderRows.filter((row) => {
    const oldStatus = existingStatusByCode.get(row.order_code)
    return oldStatus !== undefined && oldStatus !== row.status
  }).length

  if (importRecord?.id) {
    await supabase
      .from('revenue_imports')
      .update({
        status: 'done',
        orders_upserted: orderRows.length,
        orders_new: newOrders,
        orders_status_changed: statusChanged,
      })
      .eq('id', importRecord.id)
  }

  return {
    connectionId: connection.id,
    store: connection.store,
    fetched: orders.length,
    upserted: orderRows.length,
    newOrders,
    statusChanged,
    cursor,
  }
}

function getOverlappedCursor(cursor: string | null): string | null {
  if (!cursor) return null
  const date = new Date(cursor)
  if (isNaN(date.getTime())) return cursor
  date.setMinutes(date.getMinutes() - SYNC_OVERLAP_MINUTES)
  return date.toISOString()
}

function maxModifiedOn(orders: SapoOrderResponse[]): string | null {
  let max: Date | null = null
  for (const order of orders) {
    const raw = order.modified_on || order.updated_on
    if (!raw) continue
    const date = new Date(raw)
    if (isNaN(date.getTime())) continue
    if (!max || date > max) max = date
  }
  return max?.toISOString() ?? null
}
