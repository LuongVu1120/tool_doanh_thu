/**
 * Quick inspector cho dữ liệu sapo_* sau sync.
 */
import { createClient } from '@supabase/supabase-js'
import fs from 'fs'

const env = {}
for (const line of fs.readFileSync('.env', 'utf-8').split('\n')) {
  const [k, ...v] = line.split('=')
  if (k) env[k.trim()] = v.join('=').trim().replace(/^"|"$/g, '')
}

const supabase = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY)

console.log('\n=== TỔNG QUAN ===')
const counts = {}
for (const t of ['sapo_members', 'sapo_channels', 'sapo_orders']) {
  const { count } = await supabase.from(t).select('*', { count: 'exact', head: true })
  counts[t] = count
}
console.table(counts)

console.log('\n=== TOP 15 KÊNH (theo orders_count) ===')
const { data: channels } = await supabase
  .from('sapo_channels')
  .select('alias, platform, branch_name, branch_external_id, orders_count, media_member_id')
  .order('orders_count', { ascending: false })
  .limit(15)
console.table(channels)

console.log('\n=== PHÂN BỐ THEO PLATFORM (7 ngày) ===')
const { data: orders } = await supabase
  .from('sapo_orders')
  .select('platform, total_price, financial_status')
  .gte('created_on', new Date(Date.now() - 7 * 86400000).toISOString())

const byPlatform = {}
for (const o of orders || []) {
  const k = o.platform || 'other'
  if (!byPlatform[k]) byPlatform[k] = { orders: 0, revenue: 0, paid: 0 }
  byPlatform[k].orders++
  byPlatform[k].revenue += Number(o.total_price) || 0
  if (o.financial_status === 'paid') byPlatform[k].paid += Number(o.total_price) || 0
}
console.table(byPlatform)

console.log('\n=== TOP 10 NHÂN VIÊN TẠO ĐƠN ===')
const { data: byCreator } = await supabase
  .from('sapo_orders')
  .select('creator_member_id, total_price')
  .not('creator_member_id', 'is', null)
  .gte('created_on', new Date(Date.now() - 7 * 86400000).toISOString())

const creatorMap = {}
for (const o of byCreator || []) {
  if (!creatorMap[o.creator_member_id]) creatorMap[o.creator_member_id] = { orders: 0, revenue: 0 }
  creatorMap[o.creator_member_id].orders++
  creatorMap[o.creator_member_id].revenue += Number(o.total_price) || 0
}

const memberIds = Object.keys(creatorMap).map(Number)
const { data: members } = await supabase
  .from('sapo_members')
  .select('sapo_user_id, full_name, prefix_code')
  .in('sapo_user_id', memberIds)

const memberLookup = new Map((members || []).map((m) => [m.sapo_user_id, m]))

const ranked = Object.entries(creatorMap)
  .map(([id, stats]) => {
    const m = memberLookup.get(Number(id))
    return {
      name: m?.full_name || `#${id}`,
      prefix: m?.prefix_code || null,
      orders: stats.orders,
      revenue_M: Math.round(stats.revenue / 1_000_000),
    }
  })
  .sort((a, b) => b.revenue_M - a.revenue_M)
  .slice(0, 10)
console.table(ranked)

console.log('\n=== KÊNH CHƯA GÁN MEDIA MEMBER ===')
const { count: unassigned } = await supabase
  .from('sapo_channels')
  .select('*', { count: 'exact', head: true })
  .is('media_member_id', null)
console.log(`Tổng: ${unassigned} kênh chưa gán → vào /revenue/sapo-team → assign cho media member`)
