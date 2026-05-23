/**
 * Test script for the Sapo parser pipeline.
 * Run with: pnpm test:parser
 *
 * Tests all parser functions without needing a browser or Supabase.
 */

import { parseAmount } from '../src/lib/sapo-parser/amount-parser'
import { parseSapoDate, parseTags, dedupeByOrderCode } from '../src/lib/sapo-parser/parse-excel'
import { filterOrders } from '../src/lib/sapo-parser/filter-orders'
import { detectExchange } from '../src/lib/sapo-parser/exchange-detector'
import { normalizeTagForLookup, extractChannelTag } from '../src/lib/sapo-parser/tag-mapper'
import { normalize } from '../src/lib/sapo-parser/normalize'
import type { SapoRawRow, SapoOrder } from '../src/types/sapo'

// ─────────────────────────────────────────────────────────────
// Test runner
// ─────────────────────────────────────────────────────────────
let passed = 0
let failed = 0

function test(name: string, fn: () => void) {
  try {
    fn()
    console.log(`  ✅ ${name}`)
    passed++
  } catch (e) {
    console.error(`  ❌ ${name}`)
    console.error(`     ${e instanceof Error ? e.message : e}`)
    failed++
  }
}

function expect(actual: unknown) {
  return {
    toBe(expected: unknown) {
      if (actual !== expected) {
        throw new Error(`Expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`)
      }
    },
    toEqual(expected: unknown) {
      const a = JSON.stringify(actual)
      const b = JSON.stringify(expected)
      if (a !== b) {
        throw new Error(`Expected ${b}, got ${a}`)
      }
    },
    toBeNull() {
      if (actual !== null) {
        throw new Error(`Expected null, got ${JSON.stringify(actual)}`)
      }
    },
    toBeTruthy() {
      if (!actual) {
        throw new Error(`Expected truthy, got ${JSON.stringify(actual)}`)
      }
    },
    toBeFalsy() {
      if (actual) {
        throw new Error(`Expected falsy, got ${JSON.stringify(actual)}`)
      }
    },
  }
}

// ─────────────────────────────────────────────────────────────
// Amount Parser Tests
// ─────────────────────────────────────────────────────────────
console.log('\n📦 Amount Parser')

test('parse "350k" → 350000', () => {
  const r = parseAmount('350k')
  expect(r.value).toBe(350000)
  expect(r.parsed).toBe(true)
})

test('parse "1tr350k" → 1350000', () => {
  const r = parseAmount('1tr350k')
  expect(r.value).toBe(1350000)
  expect(r.parsed).toBe(true)
})

test('parse "2tr535k" → 2535000', () => {
  const r = parseAmount('2tr535k')
  expect(r.value).toBe(2535000)
  expect(r.parsed).toBe(true)
})

test('parse "1.5tr" → 1500000', () => {
  const r = parseAmount('1.5tr')
  expect(r.value).toBe(1500000)
  expect(r.parsed).toBe(true)
})

test('parse "500 nghìn" → 500000', () => {
  const r = parseAmount('500 nghìn')
  expect(r.value).toBe(500000)
  expect(r.parsed).toBe(true)
})

test('parse "0đ" → 0', () => {
  const r = parseAmount('0đ')
  expect(r.value).toBe(0)
  expect(r.parsed).toBe(true)
})

test('parse "0" → 0', () => {
  const r = parseAmount('0')
  expect(r.value).toBe(0)
  expect(r.parsed).toBe(true)
})

test('parse "abc" → null (not parsed)', () => {
  const r = parseAmount('abc')
  expect(r.value).toBeNull()
  expect(r.parsed).toBe(false)
})

test('parse "2tr" → 2000000', () => {
  const r = parseAmount('2tr')
  expect(r.value).toBe(2000000)
  expect(r.parsed).toBe(true)
})

test('parse "1,350,000" → 1350000', () => {
  const r = parseAmount('1,350,000')
  expect(r.value).toBe(1350000)
  expect(r.parsed).toBe(true)
})

// ─────────────────────────────────────────────────────────────
// Date Parser Tests
// ─────────────────────────────────────────────────────────────
console.log('\n📅 Date Parser')

test('parse "25-03-2024 14:30" → Date', () => {
  const d = parseSapoDate('25-03-2024 14:30')
  expect(d?.getDate()).toBe(25)
  expect(d?.getMonth()).toBe(2) // 0-indexed March
  expect(d?.getFullYear()).toBe(2024)
  expect(d?.getHours()).toBe(14)
  expect(d?.getMinutes()).toBe(30)
})

test('parse "1-1-2024 09:00" → Date (single digit day/month)', () => {
  const d = parseSapoDate('1-1-2024 09:00')
  expect(d?.getDate()).toBe(1)
  expect(d?.getMonth()).toBe(0)
  expect(d?.getFullYear()).toBe(2024)
})

test('parse invalid date → null', () => {
  const d = parseSapoDate('invalid')
  expect(d).toBeNull()
})

test('parse "32-01-2024" → null (invalid day)', () => {
  const d = parseSapoDate('32-01-2024')
  expect(d).toBeNull()
})

// ─────────────────────────────────────────────────────────────
// normalize() Tests (must match Python exactly)
// ─────────────────────────────────────────────────────────────
console.log('\n🔤 Normalize (Python parity)')

test('normalize("page_HuyK - Kim Hoàn") === "page huyk kim hoan"', () => {
  expect(normalize('page_HuyK - Kim Hoàn')).toBe('page huyk kim hoan')
})

test('normalize("tiktok_business_HuyK- Xưởng Vàng Bạc 2") === "tiktok business huyk xuong vang bac 2"', () => {
  expect(normalize('tiktok_business_HuyK- Xưởng Vàng Bạc 2')).toBe(
    'tiktok business huyk xuong vang bac 2'
  )
})

test('normalize("Đổi hàng không thu cod") === "doi hang khong thu cod"', () => {
  expect(normalize('Đổi hàng không thu cod')).toBe('doi hang khong thu cod')
})

test('normalizeTagForLookup delegates to normalize()', () => {
  expect(normalizeTagForLookup('page_HuyK - Kim Hoàn')).toBe('page huyk kim hoan')
})

// ─────────────────────────────────────────────────────────────
// Tag mapper Tests
// ─────────────────────────────────────────────────────────────
console.log('\n🏷️  Tag Mapper')

test('parseTags("a, b, c") → ["a", "b", "c"]', () => {
  const tags = parseTags('a, b, c')
  expect(tags.length).toBe(3)
})

test('parseTags(null) → []', () => {
  const tags = parseTags(null)
  expect(tags.length).toBe(0)
})

test('extractChannelTag finds page_HuyK tag', () => {
  const result = extractChannelTag(['random_tag', 'page_HuyK - Kim Hoàn', 'other_tag'])
  expect(result?.tag).toBe('page_HuyK - Kim Hoàn')
})

test('extractChannelTag finds tiktok_business_HuyK tag', () => {
  const result = extractChannelTag(['tiktok_business_HuyK - Nhẫn Cưới'])
  expect(result?.tag).toBe('tiktok_business_HuyK - Nhẫn Cưới')
})

test('extractChannelTag returns null when no HuyK tag', () => {
  const result = extractChannelTag(['some_other_tag', 'facebook_page'])
  expect(result).toBeNull()
})

// ─────────────────────────────────────────────────────────────
// Exchange Detector Tests
// ─────────────────────────────────────────────────────────────
console.log('\n🔄 Exchange Detector')

function makeOrder(overrides: Partial<SapoOrder> = {}): SapoOrder {
  return {
    orderCode: 'TEST001',
    source: 'Facebook',
    status: 'Đã hoàn thành',
    totalAmount: 1000000,
    notes: '',
    tags: ['page_HuyK - Kim Hoàn'],
    completedAt: new Date(),
    rawTags: 'page_HuyK - Kim Hoàn',
    ...overrides,
  }
}

test('Normal order → not exchange', () => {
  const result = detectExchange(makeOrder())
  expect(result.exchange.isExchange).toBe(false)
})

test('Tag "đổi hàng không thu cod" → exchange_no_extra', () => {
  const result = detectExchange(
    makeOrder({ tags: ['page_HuyK - Kim Hoàn', 'đổi hàng không thu cod'] })
  )
  expect(result.exchange.isExchange).toBe(true)
  expect(result.exchange.exchangeType).toBe('no_extra')
  expect(result.exchange.signal).toBe('tag_no_cod')
})

test('Tag "đổi hàng" + notes "không thu" → exchange_no_extra', () => {
  const result = detectExchange(
    makeOrder({
      tags: ['page_HuyK - Kim Hoàn', 'đổi hàng'],
      notes: 'Khách đổi size, không thu thêm tiền',
    })
  )
  expect(result.exchange.isExchange).toBe(true)
  expect(result.exchange.exchangeType).toBe('no_extra')
})

test('Tag "đổi hàng" + notes "bù 350k" → exchange_with_extra amount=350000', () => {
  const result = detectExchange(
    makeOrder({
      tags: ['page_HuyK - Kim Hoàn', 'đổi hàng'],
      notes: 'Khách đổi size lớn hơn, bù 350k',
    })
  )
  expect(result.exchange.isExchange).toBe(true)
  expect(result.exchange.exchangeType).toBe('with_extra')
  expect(result.exchange.extraAmount).toBe(350000)
})

test('Note "đổi hàng" without parseable amount → needs_review', () => {
  const result = detectExchange(
    makeOrder({
      tags: ['page_HuyK - Kim Hoàn'],
      notes: 'Đổi hàng, liên hệ lại',
    })
  )
  expect(result.exchange.isExchange).toBe(true)
  expect(result.exchange.exchangeType).toBe('needs_review')
})

// ─────────────────────────────────────────────────────────────
// Deduplication Tests
// ─────────────────────────────────────────────────────────────
console.log('\n🔁 Deduplication')

function makeRawRow(orderCode: string | null): SapoRawRow {
  return {
    orderCode,
    source: null,
    status: null,
    totalAmount: null,
    notes: null,
    tags: null,
    orderDate: null,
    completedAt: null,
  }
}

test('dedupeByOrderCode keeps first occurrence', () => {
  const rows = [
    makeRawRow('A001'),
    makeRawRow('A001'), // duplicate
    makeRawRow('A002'),
  ]
  const deduped = dedupeByOrderCode(rows)
  expect(deduped.length).toBe(2)
})

test('dedupeByOrderCode skips null codes', () => {
  const rows = [
    makeRawRow(null),
    makeRawRow('A001'),
    makeRawRow(null),
  ]
  const deduped = dedupeByOrderCode(rows)
  expect(deduped.length).toBe(1)
})

// ─────────────────────────────────────────────────────────────
// Filter Orders Tests
// ─────────────────────────────────────────────────────────────
console.log('\n🔍 Filter Orders (Python parity)')

function makeFilterRow(overrides: Partial<SapoRawRow> = {}): SapoRawRow {
  return {
    orderCode: 'TEST001',
    source: 'Facebook',
    status: 'Đã hoàn thành',
    totalAmount: '1000000',
    notes: null,
    tags: 'page_HuyK - Kim Hoàn',
    orderDate: null,
    completedAt: '15-05-2025 10:00',
    ...overrides,
  }
}

test('Completed, non-POS, non-"Bán trực tiếp" order passes filter', () => {
  const result = filterOrders([makeFilterRow()])
  expect(result.orders.length).toBe(1)
})

test('POS source excluded (Python rule 3)', () => {
  const result = filterOrders([makeFilterRow({ source: 'POS' })])
  expect(result.orders.length).toBe(0)
  expect(result.skippedReasons.excluded_source_pos).toBe(1)
})

test('"Bán trực tiếp" tag excluded (Python rule 2)', () => {
  const result = filterOrders(
    [makeFilterRow({ tags: 'page_HuyK - Kim Hoàn,Bán trực tiếp' })]
  )
  expect(result.orders.length).toBe(0)
  expect(result.skippedReasons.excluded_tag_ban_truc_tiep).toBe(1)
})

test('Non-completed status excluded', () => {
  const result = filterOrders([makeFilterRow({ status: 'Đang giao dịch' })])
  expect(result.orders.length).toBe(0)
})

test('Non-Facebook source (e.g. Website) passes — no whitelist restriction', () => {
  const result = filterOrders([makeFilterRow({ source: 'Website' })])
  expect(result.orders.length).toBe(1)
})

test('Zalo source passes (not in old whitelist test, but should work)', () => {
  const result = filterOrders([makeFilterRow({ source: 'Zalo' })])
  expect(result.orders.length).toBe(1)
})

// ─────────────────────────────────────────────────────────────
// Summary
// ─────────────────────────────────────────────────────────────
console.log(`\n${'─'.repeat(40)}`)
console.log(`Results: ${passed} passed, ${failed} failed`)

if (failed > 0) {
  process.exit(1)
}
