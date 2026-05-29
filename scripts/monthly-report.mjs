/**
 * Báo cáo doanh thu Sapo theo tháng (từ năm ngoái đến hiện tại).
 *
 * Usage:
 *   node scripts/monthly-report.mjs [--from=2025-01-01] [--platform=facebook]
 */
import { createClient } from '@supabase/supabase-js'
import fs from 'fs'

const args = {}
for (const a of process.argv.slice(2)) {
  if (!a.startsWith('--')) continue
  const eq = a.indexOf('=')
  args[a.slice(2, eq > 0 ? eq : undefined)] = eq > 0 ? a.slice(eq + 1) : '1'
}

const env = {}
for (const line of fs.readFileSync('.env', 'utf-8').split('\n')) {
  const [k, ...v] = line.split('=')
  if (k) env[k.trim()] = v.join('=').trim().replace(/^"|"$/g, '')
}
const supabase = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY)

const fromDate = args.from || '2025-01-01'
const platformFilter = args.platform || null

console.log(`\nBáo cáo từ ${fromDate} đến nay`)
if (platformFilter) console.log(`Lọc platform: ${platformFilter}`)
console.log('============================================================\n')

function fmt(n) {
  if (n >= 1_000_000_000) return (n / 1_000_000_000).toFixed(2) + ' tỷ'
  if (n >= 1_000_000) return (n / 1_000_000).toFixed(1) + 'M'
  return Math.round(n).toLocaleString('vi-VN')
}

// Pull all orders in range (page-by-page to avoid 1000-row limit)
const orders = []
const PAGE = 1000
let off = 0
while (true) {
  let q = supabase
    .from('sapo_orders')
    .select('total_price, total_received, total_refunded, status, financial_status, platform, channel_id, creator_member_id, created_on')
    .gte('created_on', new Date(fromDate).toISOString())
    .order('created_on', { ascending: true })
    .range(off, off + PAGE - 1)
  if (platformFilter) q = q.eq('platform', platformFilter)
  const { data, error } = await q
  if (error) { console.error(error); process.exit(1) }
  if (!data || data.length === 0) break
  orders.push(...data)
  if (data.length < PAGE) break
  off += PAGE
}

console.log(`Tổng đơn pull được: ${orders.length.toLocaleString('vi-VN')}\n`)

// Aggregate by month
const byMonth = new Map() // 'YYYY-MM' → stats
for (const o of orders) {
  if (!o.created_on) continue
  const d = new Date(o.created_on)
  const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
  if (!byMonth.has(key)) byMonth.set(key, {
    month: key,
    orders: 0,
    cancelled: 0,
    revenue: 0,
    paid: 0,
    received: 0,
    refunded: 0,
    by_platform: {},
  })
  const m = byMonth.get(key)
  m.orders++
  const isCancelled = o.status === 'cancelled'
  const isPaid = o.financial_status === 'paid'
  const totalPrice = Number(o.total_price) || 0
  if (isCancelled) {
    m.cancelled++
  } else {
    m.revenue += totalPrice
    if (isPaid) m.paid += totalPrice
  }
  m.received += Number(o.total_received) || 0
  m.refunded += Number(o.total_refunded) || 0

  const p = o.platform || 'other'
  if (!m.by_platform[p]) m.by_platform[p] = { orders: 0, revenue: 0 }
  if (!isCancelled) {
    m.by_platform[p].orders++
    m.by_platform[p].revenue += totalPrice
  }
}

const sorted = [...byMonth.values()].sort((a, b) => a.month.localeCompare(b.month))

console.log('=== TỔNG QUAN THEO THÁNG ===\n')
const tableRows = sorted.map((m) => ({
  Tháng: m.month,
  'Tổng đơn': m.orders.toLocaleString('vi-VN'),
  'Đã hủy': m.cancelled.toLocaleString('vi-VN'),
  'Doanh thu (₫)': fmt(m.revenue),
  'Đã thanh toán (₫)': fmt(m.paid),
  'Thực thu (₫)': fmt(m.received),
  'Refund (₫)': fmt(m.refunded),
}))
console.table(tableRows)

console.log('\n=== CHI TIẾT PLATFORM THEO THÁNG ===\n')
// Collect all platforms
const allPlatforms = [...new Set(sorted.flatMap((m) => Object.keys(m.by_platform)))]
const platformRows = sorted.map((m) => {
  const row = { Tháng: m.month }
  for (const p of allPlatforms) {
    row[`${p} đơn`] = (m.by_platform[p]?.orders || 0).toLocaleString('vi-VN')
    row[`${p} ₫`] = fmt(m.by_platform[p]?.revenue || 0)
  }
  return row
})
console.table(platformRows)

// Tổng cộng
const total = sorted.reduce(
  (acc, m) => ({
    orders: acc.orders + m.orders,
    cancelled: acc.cancelled + m.cancelled,
    revenue: acc.revenue + m.revenue,
    paid: acc.paid + m.paid,
    received: acc.received + m.received,
    refunded: acc.refunded + m.refunded,
  }),
  { orders: 0, cancelled: 0, revenue: 0, paid: 0, received: 0, refunded: 0 }
)
console.log('\n=== TỔNG CỘNG ===')
console.log(`  Đơn:               ${total.orders.toLocaleString('vi-VN')} (đã hủy ${total.cancelled.toLocaleString('vi-VN')})`)
console.log(`  Doanh thu:         ${fmt(total.revenue)} ₫`)
console.log(`  Đã thanh toán:     ${fmt(total.paid)} ₫`)
console.log(`  Thực thu:          ${fmt(total.received)} ₫`)
console.log(`  Refund:            ${fmt(total.refunded)} ₫`)

// Export JSON for further analysis
const outPath = `monthly-report-${fromDate}.json`
fs.writeFileSync(outPath, JSON.stringify({ from: fromDate, generated_at: new Date().toISOString(), total, by_month: sorted }, null, 2))
console.log(`\nĐã ghi file: ${outPath}`)
