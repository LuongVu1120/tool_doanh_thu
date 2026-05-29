export const dynamic = 'force-dynamic'

import { NextRequest, NextResponse } from 'next/server'
import { createClient, createServiceClient } from '@/lib/supabase/server'

/**
 * GET /api/sapo-v2/dashboard?from=ISO&to=ISO
 * Trả về:
 *   - summary: tổng đơn / doanh thu / paid / refund / theo trạng thái
 *   - byPlatform: gom theo platform
 *   - byChannel: gom theo channel (top 20)
 *   - byMediaMember: gom theo nhân viên media (qua mapping channel → media_member_id)
 *   - byCreator: top nhân viên tạo đơn
 */
export async function GET(request: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Chưa đăng nhập' }, { status: 401 })

  const url = new URL(request.url)
  const fromParam = url.searchParams.get('from')
  const toParam = url.searchParams.get('to')

  const from = fromParam ? new Date(fromParam) : new Date(Date.now() - 30 * 86400000)
  const to = toParam ? new Date(toParam) : new Date()

  const fromIso = from.toISOString()
  const toIso = to.toISOString()

  const serviceClient = await createServiceClient()

  // ===== Load orders trong range =====
  const orders: Array<{
    sapo_order_id: number
    total_price: number
    total_received: number
    total_refunded: number
    status: string | null
    financial_status: string | null
    platform: string | null
    channel_id: string | null
    creator_member_id: number | null
    created_on: string | null
  }> = []

  let page = 0
  const PAGE_SIZE = 1000
  while (true) {
    const { data, error } = await serviceClient
      .from('sapo_orders')
      .select('sapo_order_id, total_price, total_received, total_refunded, status, financial_status, platform, channel_id, creator_member_id, created_on')
      .gte('created_on', fromIso)
      .lte('created_on', toIso)
      .range(page * PAGE_SIZE, (page + 1) * PAGE_SIZE - 1)
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    if (!data || data.length === 0) break
    orders.push(...(data as typeof orders))
    if (data.length < PAGE_SIZE) break
    page++
  }

  // ===== Load channels + members để enrich =====
  const { data: channels } = await serviceClient
    .from('sapo_channels')
    .select('id, alias, platform, branch_name, branch_external_id, media_member_id')

  const { data: members } = await serviceClient
    .from('sapo_members')
    .select('sapo_user_id, full_name, prefix_code, is_media_team')

  const channelById = new Map((channels || []).map((c) => [c.id as string, c]))
  const memberById = new Map((members || []).map((m) => [m.sapo_user_id as number, m]))

  // ===== Aggregate =====
  const summary = {
    total_orders: orders.length,
    revenue_total: 0,
    revenue_paid: 0,
    revenue_received: 0,
    revenue_refunded: 0,
    cancelled_count: 0,
  }
  const byPlatform = new Map<string, { orders: number; revenue: number; paid: number }>()
  const byChannel = new Map<string, { channel_id: string; channel_name: string; platform: string | null; orders: number; revenue: number; paid: number; media_member_id: number | null; media_member_name: string | null }>()
  const byMedia = new Map<number, { sapo_user_id: number; name: string; prefix: string | null; orders: number; revenue: number; paid: number; channels: number }>()
  const byCreator = new Map<number, { sapo_user_id: number; name: string; prefix: string | null; orders: number; revenue: number; paid: number }>()
  const byMonth = new Map<string, {
    month: string
    orders: number
    cancelled: number
    revenue: number
    paid: number
    received: number
    refunded: number
    by_platform: Record<string, { orders: number; revenue: number }>
  }>()

  const mediaChannelCount = new Map<number, Set<string>>()

  for (const o of orders) {
    const totalPrice = Number(o.total_price) || 0
    const isCancelled = o.status === 'cancelled'
    const isPaid = o.financial_status === 'paid'

    summary.revenue_total += isCancelled ? 0 : totalPrice
    if (isPaid) summary.revenue_paid += totalPrice
    summary.revenue_received += Number(o.total_received) || 0
    summary.revenue_refunded += Number(o.total_refunded) || 0
    if (isCancelled) summary.cancelled_count++

    // ----- Aggregate theo tháng (YYYY-MM) -----
    if (o.created_on) {
      const d = new Date(o.created_on)
      const monthKey = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
      if (!byMonth.has(monthKey)) {
        byMonth.set(monthKey, {
          month: monthKey,
          orders: 0,
          cancelled: 0,
          revenue: 0,
          paid: 0,
          received: 0,
          refunded: 0,
          by_platform: {},
        })
      }
      const m = byMonth.get(monthKey)!
      m.orders++
      m.received += Number(o.total_received) || 0
      m.refunded += Number(o.total_refunded) || 0
      if (isCancelled) {
        m.cancelled++
      } else {
        m.revenue += totalPrice
        if (isPaid) m.paid += totalPrice
        const platKey = o.platform || 'other'
        if (!m.by_platform[platKey]) m.by_platform[platKey] = { orders: 0, revenue: 0 }
        m.by_platform[platKey].orders++
        m.by_platform[platKey].revenue += totalPrice
      }
    }

    if (isCancelled) continue

    // Platform
    const pKey = o.platform || 'other'
    if (!byPlatform.has(pKey)) byPlatform.set(pKey, { orders: 0, revenue: 0, paid: 0 })
    const p = byPlatform.get(pKey)!
    p.orders++
    p.revenue += totalPrice
    if (isPaid) p.paid += totalPrice

    // Channel
    if (o.channel_id) {
      const ch = channelById.get(o.channel_id)
      const chName = ch?.branch_name || ch?.alias || '(chưa rõ)'
      if (!byChannel.has(o.channel_id)) {
        const mm = ch?.media_member_id ? memberById.get(ch.media_member_id) : null
        byChannel.set(o.channel_id, {
          channel_id: o.channel_id,
          channel_name: chName,
          platform: ch?.platform || null,
          orders: 0,
          revenue: 0,
          paid: 0,
          media_member_id: ch?.media_member_id ?? null,
          media_member_name: mm?.full_name ?? null,
        })
      }
      const c = byChannel.get(o.channel_id)!
      c.orders++
      c.revenue += totalPrice
      if (isPaid) c.paid += totalPrice

      // Media member (qua channel.media_member_id)
      if (ch?.media_member_id) {
        const mid = ch.media_member_id
        if (!byMedia.has(mid)) {
          const m = memberById.get(mid)
          byMedia.set(mid, { sapo_user_id: mid, name: m?.full_name || `#${mid}`, prefix: m?.prefix_code ?? null, orders: 0, revenue: 0, paid: 0, channels: 0 })
        }
        const mm = byMedia.get(mid)!
        mm.orders++
        mm.revenue += totalPrice
        if (isPaid) mm.paid += totalPrice
        if (!mediaChannelCount.has(mid)) mediaChannelCount.set(mid, new Set())
        mediaChannelCount.get(mid)!.add(o.channel_id)
      }
    }

    // Creator
    if (o.creator_member_id) {
      if (!byCreator.has(o.creator_member_id)) {
        const m = memberById.get(o.creator_member_id)
        byCreator.set(o.creator_member_id, {
          sapo_user_id: o.creator_member_id,
          name: m?.full_name || `#${o.creator_member_id}`,
          prefix: m?.prefix_code ?? null,
          orders: 0, revenue: 0, paid: 0,
        })
      }
      const cr = byCreator.get(o.creator_member_id)!
      cr.orders++
      cr.revenue += totalPrice
      if (isPaid) cr.paid += totalPrice
    }
  }

  // Fix channels count cho byMedia
  for (const [mid, set] of mediaChannelCount.entries()) {
    const mm = byMedia.get(mid)
    if (mm) mm.channels = set.size
  }

  return NextResponse.json({
    range: { from: fromIso, to: toIso },
    summary,
    byPlatform: [...byPlatform.entries()].map(([platform, v]) => ({ platform, ...v })).sort((a, b) => b.revenue - a.revenue),
    byChannel: [...byChannel.values()].sort((a, b) => b.revenue - a.revenue).slice(0, 30),
    byMediaMember: [...byMedia.values()].sort((a, b) => b.revenue - a.revenue),
    byCreator: [...byCreator.values()].sort((a, b) => b.revenue - a.revenue).slice(0, 30),
    byMonth: [...byMonth.values()].sort((a, b) => a.month.localeCompare(b.month)),
  })
}
