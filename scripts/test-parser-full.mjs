/**
 * Test parser với cả 2 period: 2026-04 và 2026-05
 * Gộp kết quả để so sánh với phân tích ban đầu.
 */
import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const SAMPLES = path.resolve(__dirname, '..', 'samples')

import { parseExcelBuffer, filterOrders, extractChannelTags } from '../src/lib/sapo-parser/index.ts'

async function testPeriod(filePath, period) {
  const buf = fs.readFileSync(filePath)
  const buffer = buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength)
  const rows = parseExcelBuffer(buffer)
  return filterOrders(rows, period)
}

async function main() {
  const filePath = path.join(SAMPLES, 'chua_loc.xlsx')

  const r04 = await testPeriod(filePath, '2026-04')
  const r05 = await testPeriod(filePath, '2026-05')

  // Gộp kết quả 2 tháng
  const allOrders = [...r04.orders, ...r05.orders]
  const allReasons = {}
  for (const [k, v] of Object.entries(r04.skippedReasons)) {
    allReasons[k] = v + (r05.skippedReasons[k] || 0)
  }

  console.log('='.repeat(60))
  console.log('📊 KẾT QUẢ PARSER MỚI (gộp tháng 4+5/2026)')
  console.log('='.repeat(60))

  console.log(`\n📋 Tổng quan:
  Đơn giữ lại: ${allOrders.length}
  Bị loại: ${r04.skippedCount + r05.skippedCount}`)

  console.log(`\n📊 Lý do loại (gộp):`)
  for (const [reason, count] of Object.entries(allReasons).sort((a, b) => b[1] - a[1])) {
    if (count > 0) console.log(`  ${reason}: ${count}`)
  }

  // Theo nguồn
  const bySource = {}
  const bySourceRev = {}
  for (const o of allOrders) {
    bySource[o.source] = (bySource[o.source] || 0) + 1
    bySourceRev[o.source] = (bySourceRev[o.source] || 0) + o.totalAmount
  }
  console.log(`\n📊 Theo nguồn:`)
  for (const [src, count] of Object.entries(bySource).sort((a, b) => b[1] - a[1])) {
    console.log(`  ${src}: ${count} đơn | ${(bySourceRev[src] / 1_000_000).toFixed(0)}M VND`)
  }

  // Unattributed
  const unattributed = allOrders.filter(o => extractChannelTags(o.tags).length === 0)
  const totalRev = allOrders.reduce((s, o) => s + o.totalAmount, 0)
  const unattributedRev = unattributed.reduce((s, o) => s + o.totalAmount, 0)

  console.log(`\n📊 Channel tags:`)
  console.log(`  Có channel tag: ${allOrders.length - unattributed.length} | ${((totalRev - unattributedRev) / 1_000_000_000).toFixed(2)} tỷ`)
  console.log(`  Unattributed: ${unattributed.length} | ${(unattributedRev / 1_000_000_000).toFixed(3)} tỷ`)
  console.log(`  TỔNG: ${(totalRev / 1_000_000_000).toFixed(2)} tỷ VND`)

  // So sánh với phân tích trước
  console.log(`\n📊 SO SÁNH với phân tích trước đó:`)
  const expected = { 'Facebook': 1773, 'Tiktok for Business': 616, 'Zalo': 301, 'Zalo OA': 14 }
  for (const [src, exp] of Object.entries(expected)) {
    const actual = bySource[src] || 0
    const status = actual === exp ? '✅' : (Math.abs(actual - exp) < 50 ? '⚠️' : '❌')
    console.log(`  ${status} ${src}: ${actual} (mong đợi: ${exp}) | chênh: ${actual - exp}`)
  }

  console.log(`\n🎉 Test hoàn tất!`)
}

main().catch(err => { console.error('💥', err); process.exit(1) })
