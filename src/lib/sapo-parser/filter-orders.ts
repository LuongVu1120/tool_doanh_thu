import type { SapoRawRow, SapoOrder, FilterResult } from '@/types/sapo'
import { parseSapoDate, parseOrderAmount, parseTags, dedupeByOrderCode } from './parse-excel'

/**
 * Filter rules matching Python's logic exactly:
 *
 *   r1 = orders[orders['Trạng thái đơn hàng'] == 'Đã hoàn thành']
 *   r2 = r1[~r1['Tags'].apply(has_ban_truc_tiep)]   # exclude "Bán trực tiếp"
 *   r3 = r2[r2['Nguồn'] != 'POS']                   # exclude POS source
 *
 * NOTE: Python does NOT restrict to a whitelist of sources.
 * Any non-POS, non-"Bán trực tiếp", completed order is included.
 */

const COMPLETED_STATUS = 'Đã hoàn thành'
const EXCLUDED_SOURCE = 'POS'

/**
 * Check whether a raw tags string contains "Bán trực tiếp" (case-insensitive,
 * after normalizing — matches Python's has_ban_truc_tiep which uses normalize()).
 * We check both the original Vietnamese and the de-accented form.
 */
function hasBanTrucTiep(rawTags: string | null): boolean {
  if (!rawTags) return false
  const lower = rawTags.toLowerCase()
  // Match the original Vietnamese diacritics form
  if (lower.includes('bán trực tiếp')) return true
  // Also match partial / partial-normalized forms in case of encoding variation
  if (lower.includes('ban truc tiep')) return true
  return false
}

/**
 * System tags — NOT channel tags, skip when detecting channels.
 */
const SYSTEM_TAG_PATTERNS = [
  /^chatomni/i,
  /^vat$/i,
  /^post_id_/i,
  /^page_id_/i,
  /^channel_user_id_/i,
  /^tiktok_business_id_/i,
  /^tiktok channel$/i,
  /^shopee channel$/i,
  /^không cọc$/i,
  /^bán kèm$/i,
  /^kh mua lại$/i,
  /^nguồn:/i,
  /^bảo hành$/i,
  /^xuất hủy$/i,
  /^custom$/i,
  /^sos/i,
  /^sửa$/i,
  /^khách mua lại$/i,
  /^cod$/i,
]

function isSystemTag(tag: string): boolean {
  return SYSTEM_TAG_PATTERNS.some((pattern) => pattern.test(tag.trim()))
}

/**
 * Extract channel tags (remove system tags).
 */
export function extractChannelTags(tags: string[]): string[] {
  return tags.filter((tag) => !isSystemTag(tag))
}

/**
 * Step 1: Parse raw rows → filtered SapoOrder[]
 *
 * Rules (aligned with Python tinh_doanh_thu_media.py):
 * 1. Dedupe by order code (keep first row per code)
 * 2. Trạng thái == "Đã hoàn thành"
 * 3. Tags does NOT contain "Bán trực tiếp"
 * 4. Nguồn != "POS"
 *
 * NOTE: No period date filter here — ALL completed orders from the file are stored.
 * Period-based filtering happens at query time (dashboard) via completed_at range.
 * This enables seed uploads (7-month chua_loc.xlsx) and correct return matching.
 */
export function filterOrders(rows: SapoRawRow[]): FilterResult {
  const reasons: Record<string, number> = {
    no_order_code: 0,
    wrong_status: 0,
    excluded_tag_ban_truc_tiep: 0,
    excluded_source_pos: 0,
    no_date: 0,
    unattributed: 0,
  }

  // Dedupe by order code first
  const dedupedRows = dedupeByOrderCode(rows)
  const totalRows = dedupedRows.length

  const orders: SapoOrder[] = []

  for (const row of dedupedRows) {
    // Must have order code
    if (!row.orderCode) {
      reasons.no_order_code++
      continue
    }

    // Rule 1: Must be "Đã hoàn thành"
    const status = row.status || ''
    if (status !== COMPLETED_STATUS) {
      reasons.wrong_status++
      continue
    }

    // Rule 2: Exclude orders tagged "Bán trực tiếp"
    if (hasBanTrucTiep(row.tags)) {
      reasons.excluded_tag_ban_truc_tiep++
      continue
    }

    // Rule 3: Exclude POS source
    const source = row.source || ''
    if (source === EXCLUDED_SOURCE) {
      reasons.excluded_source_pos++
      continue
    }

    // Parse supporting fields
    const tags = parseTags(row.tags)
    const orderDate = parseSapoDate(row.orderDate || '')

    // Rule 4: Must have a valid date (completion date preferred, fallback to order date)
    // Sapo sometimes leaves "Ngày hoàn thành" empty for old orders — use "Ngày đặt hàng" instead
    const completedAt = parseSapoDate(row.completedAt || '') ?? orderDate
    if (!completedAt) {
      reasons.no_date++
      continue
    }

    // Track unattributed (no channel tag) but still include them
    const channelTags = extractChannelTags(tags)
    if (channelTags.length === 0) {
      reasons.unattributed++
    }

    const totalAmount = parseOrderAmount(row.totalAmount)

    orders.push({
      orderCode: row.orderCode,
      source,
      status,
      totalAmount,
      notes: row.notes || '',
      tags,
      completedAt,
      orderDate: orderDate ?? undefined,
      rawTags: row.tags || '',
    })
  }

  const skippedCount = totalRows - orders.length

  return {
    orders,
    skippedCount,
    skippedReasons: reasons,
  }
}
