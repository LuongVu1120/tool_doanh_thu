/**
 * Integration test: chạy pipeline TypeScript trên file mẫu thực
 * và so sánh với kết quả Python đã verify.
 */
import { readFileSync } from 'fs'
import { runPipeline, parseMappingFile, parseReturnsFile } from '../src/lib/sapo-parser'
import type { MappingLookup } from '../src/lib/sapo-parser/mapping-parser'

const SAMPLES = '/home/claude/project/huyk-tools/samples'

// Find mapping file by glob (name has Vietnamese chars in unzip)
import { readdirSync } from 'fs'
const files = readdirSync(SAMPLES)
const mappingFile = files.find(f => f.toLowerCase().includes('media') && f.endsWith('.xlsx'))
const returnsFile = files.find(f => f.includes('return') && f.endsWith('.xlsx'))
const ordersFile = files.find(f => f === 'chua_loc.xlsx')

console.log('Files found:')
console.log('  mapping:', mappingFile)
console.log('  returns:', returnsFile)
console.log('  orders: ', ordersFile)

if (!mappingFile || !returnsFile || !ordersFile) {
  console.error('Missing required files')
  process.exit(1)
}

// 1. Parse mapping
async function main() {
console.log('\n=== STEP 1: PARSE MAPPING ===')
const mappingBuf = readFileSync(`${SAMPLES}/${mappingFile}`)
const ab = mappingBuf.buffer.slice(mappingBuf.byteOffset, mappingBuf.byteOffset + mappingBuf.byteLength) as ArrayBuffer
const mapping: MappingLookup = parseMappingFile(ab)
console.log(`Total rows: ${mapping.totalRows}`)
console.log(`Total employees: ${mapping.totalEmployees}`)
console.log(`Total channels: ${mapping.totalChannels}`)
console.log(`Unassigned: ${mapping.unassignedCount}`)
console.log(`Lookup keys: ${mapping.lookup.size}`)
console.log(`Expected from Python: 71 rows, 18 employees, ~132 lookup keys, 4 unassigned`)

// 2. Run pipeline on orders file for 2026-04
console.log('\n=== STEP 2: RUN PIPELINE (period 2026-04) ===')
const ordersBuf = readFileSync(`${SAMPLES}/${ordersFile}`)
const ordersAB = ordersBuf.buffer.slice(ordersBuf.byteOffset, ordersBuf.byteOffset + ordersBuf.byteLength) as ArrayBuffer

const result = await runPipeline(ordersAB, {
  // period filter removed — see filter-orders.ts
  existingOrderCodes: new Set(),
  mappingLookup: mapping,
})

console.log('Stats:', result.stats)
console.log(`Processed orders: ${result.processed.length}`)

// Tổng doanh thu
const totalRevenue = result.processed.reduce((sum, p) => sum + p.effectiveAmount, 0)
console.log(`Total revenue: ${(totalRevenue / 1e9).toFixed(3)} tỷ`)

// Match nhân viên
const matched = result.processed.filter(p => p.employeeName)
const unmatched = result.processed.filter(p => !p.employeeName)
console.log(`Match nhân viên: ${matched.length} đơn`)
console.log(`Không match: ${unmatched.length} đơn`)

const matchedRev = matched.reduce((s, p) => s + p.effectiveAmount, 0)
const unmatchedRev = unmatched.reduce((s, p) => s + p.effectiveAmount, 0)
console.log(`Doanh thu match: ${(matchedRev / 1e9).toFixed(3)} tỷ`)
console.log(`Doanh thu không match: ${(unmatchedRev / 1e6).toFixed(0)} M`)

console.log('\n=== EXPECTED FROM PYTHON (verified earlier) ===')
console.log('After 3 rule (chua_loc, period=any): 4,639 đơn, 8.633 tỷ')
console.log('Match nhân viên: 2,987 đơn / 6.431 tỷ (74.5%)')
console.log('Có tag chưa map: 130 đơn / 464M')
console.log('Không tag: 1,554 đơn / 1.956 tỷ')

console.log('\n=== TOP 5 NHÂN VIÊN ===')
const byEmp = new Map<string, { count: number; revenue: number }>()
for (const p of matched) {
  const key = p.employeeName || 'unknown'
  const cur = byEmp.get(key) || { count: 0, revenue: 0 }
  cur.count++
  cur.revenue += p.effectiveAmount
  byEmp.set(key, cur)
}
const sorted = [...byEmp.entries()].sort((a, b) => b[1].revenue - a[1].revenue)
for (const [name, s] of sorted.slice(0, 8)) {
  console.log(`  ${name}: ${s.count} đơn / ${(s.revenue / 1e6).toFixed(1)}M`)
}

// 3. Parse returns
console.log('\n=== STEP 3: PARSE RETURNS ===')
const returnsBuf = readFileSync(`${SAMPLES}/${returnsFile}`)
const returnsAB = returnsBuf.buffer.slice(returnsBuf.byteOffset, returnsBuf.byteOffset + returnsBuf.byteLength) as ArrayBuffer
const returns = parseReturnsFile(returnsAB)
console.log(`Total returns: ${returns.length}`)

// Match returns với processed orders
const orderCodes = new Set(result.processed.map(p => p.order.orderCode))
const matchedReturns = returns.filter(r => orderCodes.has(r.originalOrderCode))
const unmatchedReturns = returns.filter(r => !orderCodes.has(r.originalOrderCode))
console.log(`Returns match với đơn Media tháng 4: ${matchedReturns.length}`)
console.log(`Returns không match: ${unmatchedReturns.length}`)
console.log('Expected from Python: 319 unique, 2 match, 317 unmatch')

}
main().catch(e => { console.error(e); process.exit(1) })
