import type { SapoOrder, ExchangeInfo, ExchangeDetectionResult } from '@/types/sapo'
import { extractAmountFromText } from './amount-parser'

// Tag-based signals
const TAG_NO_COD = 'đổi hàng không thu cod'
const TAG_EXCHANGE = 'đổi hàng'

// Regex for note-based detection of exchange orders
const EXCHANGE_NOTE_REGEX = /đổi\s*(hàng|size|sản\s*phẩm)/i

// Regex for determining exchange type from notes
const NO_EXTRA_REGEX = /không\s*thu|thu\s*0|thu\s*gì|0\s*đ|miễn\s*phí/i
const WITH_EXTRA_REGEX = /bù\s*(\d+[^\s,]*)|thu\s*thêm?\s*(\d+[^\s,]*)|thu\s*(\d+[^\s,]*)/i

function normalizeTag(tag: string): string {
  return tag.toLowerCase().trim()
}

/**
 * Step 3: Detect exchange orders and classify them.
 *
 * Signal A: Tag "Đổi hàng không thu cod" → EXCLUDE entirely ("exchange_no_extra")
 * Signal B: Tag "Đổi hàng" → investigate notes further
 * Signal C: Notes match /đổi\s*(hàng|size|sản\s*phẩm)/i → investigate notes
 *
 * Classification:
 * Rule 1: Notes match no-extra regex → "exchange_no_extra" (EXCLUDE)
 * Rule 2: Notes contain bù/thu + parseable amount → "exchange_with_extra" (include with reduced amount)
 * Rule 3: Cannot determine → "needs_review"
 */
export function detectExchange(order: SapoOrder): ExchangeDetectionResult {
  const normalizedTags = order.tags.map(normalizeTag)
  const notes = order.notes.toLowerCase()

  // Signal A: direct no-COD tag
  if (normalizedTags.includes(TAG_NO_COD)) {
    return {
      order,
      exchange: {
        isExchange: true,
        exchangeType: 'no_extra',
        extraAmount: null,
        signal: 'tag_no_cod',
      },
    }
  }

  // Signal B: "đổi hàng" tag
  const hasExchangeTag = normalizedTags.includes(TAG_EXCHANGE)
  // Signal C: note regex
  const hasExchangeNote = EXCHANGE_NOTE_REGEX.test(order.notes)

  if (!hasExchangeTag && !hasExchangeNote) {
    // No exchange signal
    return {
      order,
      exchange: {
        isExchange: false,
        exchangeType: null,
        extraAmount: null,
        signal: null,
      },
    }
  }

  const signal = hasExchangeTag ? 'tag_exchange' : 'note_regex'

  // Now determine type from notes
  // Rule 1: explicitly no extra charge
  if (NO_EXTRA_REGEX.test(notes)) {
    return {
      order,
      exchange: {
        isExchange: true,
        exchangeType: 'no_extra',
        extraAmount: null,
        signal,
      },
    }
  }

  // Rule 2: has an extractable extra amount
  if (WITH_EXTRA_REGEX.test(notes)) {
    const extracted = extractAmountFromText(order.notes)
    if (extracted && extracted.parsed && extracted.value !== null && extracted.value > 0) {
      return {
        order,
        exchange: {
          isExchange: true,
          exchangeType: 'with_extra',
          extraAmount: extracted.value,
          signal,
        },
      }
    }
  }

  // Rule 3: can't determine → needs review
  return {
    order,
    exchange: {
      isExchange: true,
      exchangeType: 'needs_review',
      extraAmount: null,
      signal,
    },
  }
}

export function detectExchangesBatch(orders: SapoOrder[]): ExchangeDetectionResult[] {
  return orders.map(detectExchange)
}
