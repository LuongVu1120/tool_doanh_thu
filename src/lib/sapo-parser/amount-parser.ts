import type { ParsedAmount } from '@/types/sapo'

/**
 * Parse Vietnamese currency shorthand strings to numeric values (VND).
 *
 * Supported formats:
 *  "350k"        → 350,000
 *  "1tr350k"     → 1,350,000
 *  "2tr535k"     → 2,535,000
 *  "1.5tr"       → 1,500,000
 *  "500 nghìn"   → 500,000
 *  "2 triệu"     → 2,000,000
 *  "1,350,000"   → 1,350,000  (standard numeric with commas)
 *  "1350000"     → 1,350,000
 *  "0đ" / "0"   → 0
 */
export function parseAmount(raw: string): ParsedAmount {
  const trimmed = raw.trim().toLowerCase()

  if (!trimmed || trimmed === '0' || trimmed === '0đ' || trimmed === '0 đ') {
    return { raw, value: 0, parsed: true }
  }

  // Remove all spaces for easier parsing (except we keep the original for the return value)
  const normalized = trimmed.replace(/\s+/g, '')

  // Pattern: {millions}tr{thousands}k  e.g. "1tr350k", "2tr535k"
  const trAndK = normalized.match(/^(\d+(?:[.,]\d+)?)tr(\d+)k$/)
  if (trAndK) {
    const millions = parseFloat(trAndK[1].replace(',', '.'))
    const thousands = parseInt(trAndK[2], 10)
    return { raw, value: millions * 1_000_000 + thousands * 1_000, parsed: true }
  }

  // Pattern: {millions}tr  e.g. "1.5tr", "2tr", "1,5tr"
  const trOnly = normalized.match(/^(\d+(?:[.,]\d+)?)tr$/)
  if (trOnly) {
    const millions = parseFloat(trOnly[1].replace(',', '.'))
    return { raw, value: millions * 1_000_000, parsed: true }
  }

  // Pattern: {thousands}k  e.g. "350k", "500k"
  const kOnly = normalized.match(/^(\d+(?:[.,]\d+)?)k$/)
  if (kOnly) {
    const thousands = parseFloat(kOnly[1].replace(',', '.'))
    return { raw, value: thousands * 1_000, parsed: true }
  }

  // Pattern: Vietnamese words "nghìn", "triệu" (with optional spaces)
  const nghìn = normalized.match(/^(\d+(?:[.,]\d+)?)(nghìn|nghin|nghìn)$/)
  if (nghìn) {
    const val = parseFloat(nghìn[1].replace(',', '.'))
    return { raw, value: val * 1_000, parsed: true }
  }

  const triệu = normalized.match(/^(\d+(?:[.,]\d+)?)(triệu|trieu|triêu)$/)
  if (triệu) {
    const val = parseFloat(triệu[1].replace(',', '.'))
    return { raw, value: val * 1_000_000, parsed: true }
  }

  // Pattern: standard numeric with optional dots/commas as thousands separators
  // "1,350,000" or "1.350.000" or "1350000"
  const numericStr = normalized.replace(/[,\.]/g, '')
  if (/^\d+$/.test(numericStr)) {
    const value = parseInt(numericStr, 10)
    // Sanity check: Sapo amounts are in VND, reasonable range 0 - 100tr
    if (value >= 0 && value <= 100_000_000) {
      return { raw, value, parsed: true }
    }
  }

  return { raw, value: null, parsed: false }
}

/**
 * Parse amount from a text that may contain the amount embedded (from notes).
 * Extracts the first matching amount pattern.
 */
export function extractAmountFromText(text: string): ParsedAmount | null {
  const lower = text.toLowerCase()

  // Patterns to try (in order of specificity)
  const patterns = [
    // "bù 350k", "thu 1tr350k", etc.
    /(?:bù|thu|thêm|thêm\s+)\s*(\d+(?:[.,]\d+)?(?:tr\d+k|tr|k|nghìn|triệu)?)/i,
    // standalone amounts with unit
    /(\d+(?:[.,]\d+)?(?:tr\d+k|tr|k|nghìn|triệu))/i,
  ]

  for (const pattern of patterns) {
    const match = lower.match(pattern)
    if (match && match[1]) {
      const result = parseAmount(match[1])
      if (result.parsed && result.value !== null && result.value > 0) {
        return result
      }
    }
  }

  return null
}
