import type { SapoRawRow, TagMappingResult } from '@/types/sapo'
import type { Json } from '@/types/database'
import type { MappingLookup } from '@/lib/sapo-parser/mapping-parser'
import { normalize } from '@/lib/sapo-parser/normalize'
import { dedupeByOrderCode, parseOrderAmount, parseSapoDate } from '@/lib/sapo-parser/parse-excel'
import { runPipelineFromRows } from '@/lib/sapo-parser'
import type { TypedSupabaseClient } from '@/lib/supabase/types'

export interface SapoOrderMeta {
  sapo_order_id?: string | null
  sapo_financial_status?: string | null
  sapo_fulfillment_status?: string | null
  sapo_status?: string | null
  sapo_modified_on?: string | null
  sapo_raw?: Json | null
}

export interface OrderImportRow {
  order_code: string
  source: string | null
  status: string | null
  channel_tag_matched: string | null
  employee_name: string | null
  employee_id: string | null
  completion_date: string | null
  order_date: string | null
  total_amount: number
  original_amount: number
  recognized_amount: number
  exchange_type: 'none' | 'no_extra' | 'with_extra' | 'needs_review'
  review_status: 'none' | 'pending' | 'included' | 'excluded'
  review_resolution: null
  raw_tags: string
  notes: string
  is_returned?: boolean
  first_imported_at: string
  last_updated_at: string
  sapo_order_id?: string | null
  sapo_financial_status?: string | null
  sapo_fulfillment_status?: string | null
  sapo_status?: string | null
  sapo_modified_on?: string | null
  sapo_raw?: Json | null
}

export async function loadActiveMappingLookup(
  supabase: TypedSupabaseClient
): Promise<MappingLookup> {
  const { data: latestImport } = await supabase
    .from('mapping_imports')
    .select('id')
    .is('active_to', null)
    .order('active_from', { ascending: false })
    .limit(1)
    .maybeSingle()

  const lookup = new Map<string, { employeeName: string; channelDisplay: string }>()
  const employeeSet = new Set<string>()

  if (!latestImport) {
    return { lookup, totalRows: 0, totalEmployees: 0, totalChannels: 0, unassignedCount: 0, entries: [] }
  }

  const { data: tagRows } = await supabase
    .from('channel_tags')
    .select('tag_name_normalized, tag_name_original, channel_display, employee_name, employee_id')
    .eq('mapping_import_id', latestImport.id)

  for (const row of tagRows || []) {
    if (row.tag_name_normalized) {
      lookup.set(row.tag_name_normalized, {
        employeeName: row.employee_name || 'CHƯA GÁN',
        channelDisplay: row.channel_display || row.tag_name_original || '',
      })
    }
    if (row.employee_name) employeeSet.add(row.employee_name)
  }

  return {
    lookup,
    totalRows: tagRows?.length ?? 0,
    totalEmployees: employeeSet.size,
    totalChannels: tagRows?.length ?? 0,
    unassignedCount: (tagRows || []).filter((r: { employee_name: string | null }) => !r.employee_name).length,
    entries: [],
  }
}

export async function buildOrderImportRows(
  rawRows: SapoRawRow[],
  options: {
    mappingLookup: MappingLookup
    now?: string
    metadataByOrderCode?: Map<string, SapoOrderMeta>
  }
): Promise<{ rows: OrderImportRow[]; stats: Awaited<ReturnType<typeof runPipelineFromRows>>['stats'] }> {
  const now = options.now ?? new Date().toISOString()
  const pipelineResult = await runPipelineFromRows(rawRows, {
    existingOrderCodes: new Set(),
    mappingLookup: options.mappingLookup,
  })

  const recognizedByCode = new Map<string, TagMappingResult>(
    pipelineResult.processed.map((r) => [r.order.orderCode, r])
  )
  const noExtraExchangeCodes = new Set(
    pipelineResult.excluded
      .filter((e) => e.reason === 'exchange_no_extra')
      .map((e) => e.order.orderCode)
  )

  const rows = dedupeByOrderCode(rawRows).map((row) => {
    const orderCode = row.orderCode || ''
    const recognized = orderCode ? recognizedByCode.get(orderCode) : null
    const meta = orderCode ? options.metadataByOrderCode?.get(orderCode) : null
    const totalAmount = parseOrderAmount(row.totalAmount)
    const completedAt = parseSapoDate(row.completedAt || '')
    const orderDate = parseSapoDate(row.orderDate || '')
    const isNoExtraExchange = orderCode ? noExtraExchangeCodes.has(orderCode) : false
    const exchangeType: OrderImportRow['exchange_type'] =
      recognized?.exchangeStatus === 'exchange_with_extra' ? 'with_extra'
      : recognized?.exchangeStatus === 'needs_review' ? 'needs_review'
      : isNoExtraExchange ? 'no_extra'
      : 'none'

    const financialStatus = meta?.sapo_financial_status?.toLowerCase() ?? null
    const sapoStatus = meta?.sapo_status?.toLowerCase() ?? null
    const isCancelled = sapoStatus === 'cancelled' || row.status === 'Đã hủy'
    const isRefunded = financialStatus === 'refunded'
    const isPartiallyRefunded = financialStatus === 'partially_refunded'

    let reviewStatus: OrderImportRow['review_status'] =
      exchangeType === 'needs_review' || (recognized && !recognized.employeeName)
        ? 'pending'
        : 'none'
    let recognizedAmount = reviewStatus === 'pending' || isNoExtraExchange
      ? 0
      : recognized?.effectiveAmount ?? 0

    if (isCancelled || isRefunded) {
      recognizedAmount = 0
    } else if (isPartiallyRefunded) {
      recognizedAmount = 0
      reviewStatus = 'pending'
    }

    return {
      order_code: orderCode,
      source: row.source,
      status: row.status,
      channel_tag_matched: recognized?.channelTag ?? null,
      employee_name: recognized?.employeeName ?? null,
      employee_id: recognized?.employeeId ?? null,
      completion_date: completedAt ? formatDateOnly(completedAt) : null,
      order_date: orderDate ? formatDateOnly(orderDate) : null,
      total_amount: totalAmount,
      original_amount: totalAmount,
      recognized_amount: recognizedAmount,
      exchange_type: exchangeType,
      review_status: reviewStatus,
      review_resolution: null,
      raw_tags: row.tags || '',
      notes: row.notes || '',
      is_returned: isCancelled || isRefunded,
      first_imported_at: now,
      last_updated_at: now,
      sapo_order_id: meta?.sapo_order_id ?? null,
      sapo_financial_status: meta?.sapo_financial_status ?? null,
      sapo_fulfillment_status: meta?.sapo_fulfillment_status ?? null,
      sapo_status: meta?.sapo_status ?? null,
      sapo_modified_on: meta?.sapo_modified_on ?? null,
      sapo_raw: meta?.sapo_raw ?? null,
    }
  }).filter((row) => row.order_code)

  return { rows, stats: pipelineResult.stats }
}

export function formatDateOnly(date: Date): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`
}

export function normalizeMappingTag(raw: string): string {
  return normalize(raw)
}
