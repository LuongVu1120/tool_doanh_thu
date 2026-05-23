import type { SapoOrder, TagMappingResult, ExchangeDetectionResult, ExchangeStatus } from '@/types/sapo'
import { normalize, fuzzyContains } from './normalize'
import type { MappingLookup } from './mapping-parser'

export interface ChannelTagLookup {
  normalizedTag: string
  employeeId: string
  employeeName: string
}

/**
 * Find the first matching employee for a comma-separated tags string.
 *
 * Matches Python's find_employee() logic:
 *   for t in tags_str.split(','):
 *     tn = normalize(t)
 *     # Direct match
 *     if tn in lookup: return lookup[tn]
 *     # Partial fuzzy: key in tag OR tag in key (len diff < 30, key len > 5)
 *     for k, v in lookup.items():
 *       if k and len(k) > 5 and (k in tn or tn in k) and abs(len(k) - len(tn)) < 30:
 *         return v
 *
 * @param rawTags  Raw comma-separated tags string from the order
 * @param lookup   MappingLookup.lookup map from parseMappingFile()
 */
export function findEmployee(
  rawTags: string,
  lookup: Map<string, { employeeName: string; channelDisplay: string }>
): { employeeName: string; channelDisplay: string } | null {
  if (!rawTags) return null

  const tagList = rawTags.split(',')

  for (const tag of tagList) {
    const tn = normalize(tag)
    if (!tn) continue

    // Direct match
    const direct = lookup.get(tn)
    if (direct) return direct

    // Partial fuzzy match
    for (const [k, v] of lookup.entries()) {
      if (!k || k.length <= 5) continue
      if (fuzzyContains(k, tn)) return v
    }
  }

  return null
}

/**
 * Step 4: Map orders to employees via the MappingLookup built from DANH SACH file.
 * Uses Python's fuzzy matching algorithm.
 */
export function mapOrderTags(
  exchangeResults: ExchangeDetectionResult[],
  mappingLookup: MappingLookup
): TagMappingResult[] {
  const results: TagMappingResult[] = []

  for (const { order, exchange } of exchangeResults) {
    // Skip orders that are fully excluded (no_extra exchanges)
    if (exchange.isExchange && exchange.exchangeType === 'no_extra') {
      continue
    }

    const match = findEmployee(order.rawTags, mappingLookup.lookup)

    const channelTag: string | null = match ? match.channelDisplay : null
    const employeeName: string | null = match ? match.employeeName : null
    // employeeId will be resolved at the DB layer using the employee name
    const employeeId: string | null = null

    // Determine exchange status and effective amount
    let exchangeStatus: ExchangeStatus = 'normal'
    let effectiveAmount = order.totalAmount

    if (exchange.isExchange) {
      if (exchange.exchangeType === 'with_extra' && exchange.extraAmount !== null) {
        exchangeStatus = 'exchange_with_extra'
        effectiveAmount = exchange.extraAmount
      } else if (exchange.exchangeType === 'needs_review') {
        exchangeStatus = 'needs_review'
        effectiveAmount = order.totalAmount
      }
    }

    results.push({
      order,
      channelTag,
      employeeId,
      employeeName,
      exchangeStatus,
      effectiveAmount,
    })
  }

  return results
}

/**
 * Build a lookup Map from an array of ChannelTagLookup items.
 * Used for backward compatibility with the old DB-backed tag system.
 */
export function buildTagLookupMap(tags: ChannelTagLookup[]): Map<string, ChannelTagLookup> {
  const map = new Map<string, ChannelTagLookup>()
  for (const tag of tags) {
    map.set(tag.normalizedTag, tag)
  }
  return map
}

/**
 * Legacy normalize function — kept for backward compatibility.
 * New code should use normalize() from ./normalize.ts
 */
export function normalizeTagForLookup(tag: string): string {
  return normalize(tag)
}

/**
 * Extract any channel tag from an order's tags array.
 * Returns the first tag that looks like a HuyK channel tag.
 * Legacy function — new pipeline uses findEmployee() with MappingLookup.
 */
export function extractChannelTag(
  tags: string[]
): { tag: string; normalizedTag: string } | null {
  const HUYK_TAG_PREFIXES = ['page_huyk', 'tiktok_business_huyk']
  for (const tag of tags) {
    const lower = tag.toLowerCase()
    if (HUYK_TAG_PREFIXES.some((prefix) => lower.startsWith(prefix))) {
      return { tag, normalizedTag: normalize(tag) }
    }
  }
  return null
}
