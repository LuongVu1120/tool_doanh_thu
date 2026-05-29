export const dynamic = 'force-dynamic'

import { NextRequest, NextResponse } from 'next/server'
import { createClient, createServiceClient } from '@/lib/supabase/server'

export async function GET() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Chưa đăng nhập' }, { status: 401 })

  const { data, error } = await supabase
    .from('sapo_channels')
    .select(`
      id, alias, platform, branch_name, branch_external_id,
      main_name, sub_name, app_alias,
      media_member_id, orders_count, first_seen_at, last_seen_at
    `)
    .order('orders_count', { ascending: false })

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ channels: data })
}

export async function PATCH(request: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Chưa đăng nhập' }, { status: 401 })

  const { data: profile } = await supabase
    .from('users')
    .select('role')
    .eq('id', user.id)
    .single()
  if (!profile || !['admin', 'media'].includes(profile.role)) {
    return NextResponse.json({ error: 'Cần quyền admin hoặc media' }, { status: 403 })
  }

  const body = await request.json().catch(() => ({})) as {
    channel_id?: string
    media_member_id?: number | null
    assignments?: Array<{ channel_id: string; media_member_id: number | null }>
  }

  const serviceClient = await createServiceClient()
  const updates = body.assignments || (body.channel_id ? [{ channel_id: body.channel_id, media_member_id: body.media_member_id ?? null }] : [])

  if (updates.length === 0) {
    return NextResponse.json({ error: 'Cần cung cấp channel_id + media_member_id hoặc assignments[]' }, { status: 400 })
  }

  const results: Array<{ id: string; ok: boolean; error?: string }> = []
  for (const u of updates) {
    const { error } = await serviceClient
      .from('sapo_channels')
      .update({ media_member_id: u.media_member_id })
      .eq('id', u.channel_id)
    results.push({ id: u.channel_id, ok: !error, error: error?.message })
  }

  return NextResponse.json({ ok: true, results })
}
