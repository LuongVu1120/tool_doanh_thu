import type { PipelineResult, SapoOrder, TagMappingResult } from '@/types/sapo'
import { parseExcelBuffer } from './parse-excel'
import { filterOrders, extractChannelTags } from './filter-orders'
import { deduplicateAgainstDB } from './deduplicate'
import { detectExchangesBatch } from './exchange-detector'
import { mapOrderTags, type ChannelTagLookup } from './tag-mapper'
import type { MappingLookup } from './mapping-parser'

export interface PipelineOptions {
  /**
   * Existing order codes already in the DB — used for anti-dedup.
   * Orders whose code is in this set will be skipped.
   */
  existingOrderCodes: Set<string>
  /**
   * MappingLookup built from DANH_SACH_CAC_KENH_MEDIA.xlsx via parseMappingFile().
   * Used for fuzzy tag → employee matching.
   * Pass an empty lookup ({lookup: new Map(), ...}) if no mapping file has been uploaded yet.
   */
  mappingLookup: MappingLookup
}

/**
 * Run the full 4-step processing pipeline on a Sapo Excel file buffer.
 *
 * Step 1: Parse & Filter (aligned with Python: completed, not-POS, not-bán-trực-tiếp)
 * Step 2: Anti-duplicate (check against existing DB order codes)
 * Step 3: Exchange detection (tag + note analysis)
 * Step 4: Tag mapping (fuzzy match via MappingLookup)
 */
export async function runPipeline(
  buffer: ArrayBuffer,
  options: PipelineOptions
): Promise<PipelineResult> {
  const { existingOrderCodes, mappingLookup } = options

  // --- Step 1: Parse Excel + Filter ---
  const rawRows = parseExcelBuffer(buffer)
  const filterResult = filterOrders(rawRows)

  const totalRows = rawRows.length
  const filteredRows = filterResult.orders.length

  // --- Step 2: Anti-duplicate ---
  const dedupResult = deduplicateAgainstDB(filterResult.orders, existingOrderCodes)
  const duplicatesSkipped = dedupResult.duplicateOrderCodes.length

  // --- Step 3: Exchange detection ---
  const exchangeResults = detectExchangesBatch(dedupResult.newOrders)

  const excluded: Array<{ order: SapoOrder; reason: string }> = []
  const needsReview: SapoOrder[] = []
  const toProcess = exchangeResults.filter(({ order, exchange }) => {
    if (exchange.isExchange && exchange.exchangeType === 'no_extra') {
      excluded.push({ order, reason: 'exchange_no_extra' })
      return false
    }
    if (exchange.isExchange && exchange.exchangeType === 'needs_review') {
      needsReview.push(order)
      return true // still processed, but flagged
    }
    return true
  })

  const exchangesExcluded = excluded.length

  // --- Step 4: Tag mapping (fuzzy, via MappingLookup) ---
  const processed: TagMappingResult[] = mapOrderTags(toProcess, mappingLookup)

  return {
    processed,
    duplicates: dedupResult.duplicateOrderCodes,
    needsReview,
    excluded,
    stats: {
      totalRows,
      filteredRows,
      duplicatesSkipped,
      exchangesExcluded,
      needsReview: needsReview.length,
      finalOrders: processed.length,
    },
  }
}

// Re-export individual functions and types
export { parseExcelBuffer, parseSapoDate } from './parse-excel'
export { filterOrders, extractChannelTags } from './filter-orders'
export { deduplicateAgainstDB } from './deduplicate'
export { detectExchange, detectExchangesBatch } from './exchange-detector'
export { mapOrderTags, extractChannelTag, buildTagLookupMap, normalizeTagForLookup } from './tag-mapper'
export { parseAmount, extractAmountFromText } from './amount-parser'
export { normalize, fuzzyContains } from './normalize'
export { parseMappingFile } from './mapping-parser'
export type { MappingEntry, MappingLookup } from './mapping-parser'
export { parseReturnsFile } from './returns-parser'
export type { ReturnOrder } from './returns-parser'
export type { ChannelTagLookup } from './tag-mapper'
