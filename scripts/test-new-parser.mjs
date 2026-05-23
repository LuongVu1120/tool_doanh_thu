/**
 * Test parser mới với file chua_loc.xlsx
 * Kiểm tra pipeline sau khi đã cập nhật rules cho team traffic.
 */
import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const SAMPLES = path.resolve(__dirname, '..', 'samples')

// Import parser functions
import { parseExcelBuffer, filterOrders, extractChannelTags, deduplicateAgainstDB } from '../src/lib/sapo-parser/index.ts'

async function main() {
  const filePath = path.join(SAMPLES, 'chua_loc.xlsx')
  if (!fs.existsSync(filePath)) {
    console.error('❌ Không tìm thấy chua_loc.xlsx')
    process.exit(1)
  }

  const buf = fs.readFileSync(filePath)
  const buffer = buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength)

  console.log('🔍 Đọc file Excel...')
  const rows = parseExcelBuffer(buffer)
  console.log(`✅ Đã đọc: ${rows.length} dòng (đã dedupe + forward-fill)`)
  console.log(`   5 dòng đầu:`)
  rows.slice(0, 5).forEach((r, i) => {
    console.log(`   [${i}] code=${r.col2} | source=${r.col5} | status=${r.col7} | amount=${r.col16} | tags=${r.col18?.substring(0,60)}...`)
  })

  // Test filter với period "2026-05"
  console.log('\n🔍 Test filterOrders (period=2026-05)...')
  const filterResult = filterOrders(rows, '2026-05')
  console.log(`✅ Sau filter:`)
  console.log(`   Tổng dòng input: ${rows.length}`)
  console.log(`   Đơn giữ lại: ${filterResult.orders.length}`)
  console.log(`   Bị loại: ${filterResult.skippedCount}`)
  console.log(`\n📊 Lý do loại:`)
  for (const [reason, count] of Object.entries(filterResult.skippedReasons)) {
    if (count > 0) console.log(`   ${reason}: ${count}`)
  }

  // Phân loại theo nguồn
  console.log(`\n📊 Phân loại theo nguồn:`)
  const bySource = {}
  for (const o of filterResult.orders) {
    bySource[o.source] = (bySource[o.source] || 0) + 1
  }
  for (const [src, count] of Object.entries(bySource).sort((a, b) => b[1] - a[1])) {
    console.log(`   ${src}: ${count} đơn`)
  }

  // Channel tags analysis
  console.log(`\n📊 Channel tags (sau khi lọc system tags):`)
  const unattributed = filterResult.orders.filter(o => extractChannelTags(o.tags).length === 0)
  console.log(`   Có channel tag: ${filterResult.orders.length - unattributed.length}`)
  console.log(`   KHÔNG có channel tag (unattributed): ${unattributed.length}`)
  
  if (unattributed.length > 0) {
    console.log(`   Mẫu đơn không tag:`)
    unattributed.slice(0, 3).forEach(o => {
      console.log(`   - ${o.orderCode} | ${o.source} | ${o.totalAmount}đ | tags="${o.rawTags}"`)
    })
  }

  // Doanh thu tổng
  const totalRev = filterResult.orders.reduce((s, o) => s + o.totalAmount, 0)
  console.log(`\n💰 Tổng doanh thu traffic: ${(totalRev / 1_000_000_000).toFixed(2)} tỷ VND`)

  // So sánh nhanh với kết quả phân tích trước đó
  console.log(`\n📊 SO SÁNH với phân tích trước:`)
  console.log(`   Facebook: ${bySource['Facebook'] || 0} (mong đợi: 1773)`)
  console.log(`   Tiktok for Business: ${bySource['Tiktok for Business'] || 0} (mong đợi: 616)`)
  console.log(`   Zalo: ${bySource['Zalo'] || 0} (mong đợi: 301)`)
  console.log(`   Zalo OA: ${bySource['Zalo OA'] || 0} (mong đợi: 14)`)

  console.log('\n🎉 Test hoàn tất!')
}

main().catch(err => {
  console.error('💥 Lỗi:', err)
  process.exit(1)
})
