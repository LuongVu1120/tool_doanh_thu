export const dynamic = 'force-dynamic'

import { NextRequest, NextResponse } from 'next/server'
import { createClient, createServiceClient } from '@/lib/supabase/server'

function normalize(value: string) {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/đ/g, 'd')
    .replace(/Đ/g, 'D')
    .replace(/đ/g, 'd')
    .replace(/Đ/g, 'D')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
}

async function requireUser() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: NextResponse.json({ error: 'Chưa đăng nhập' }, { status: 401 }) }
  return { supabase, user }
}

async function requireEditor() {
  const auth = await requireUser()
  if (auth.error) return auth
  const { data: profile } = await auth.supabase!
    .from('users')
    .select('role')
    .eq('id', auth.user!.id)
    .single()
  if (!profile || !['admin', 'media'].includes(profile.role)) {
    return { error: NextResponse.json({ error: 'Cần quyền admin hoặc media' }, { status: 403 }) }
  }
  return auth
}

export async function GET(request: NextRequest) {
  const auth = await requireUser()
  if (auth.error) return auth.error

  const url = new URL(request.url)
  const status = url.searchParams.get('status') || 'review'
  const serviceClient = await createServiceClient()

  let query = (serviceClient as any)
    .from('sapo_channel_aliases')
    .select(`
      id, alias_text, normalized_alias, platform, platform_key, excel_owner, excel_month,
      excel_revenue, channel_id, owner_member_id, source, confidence, status,
      candidates, notes, updated_at
    `)
    .order('excel_revenue', { ascending: false })
    .limit(500)

  if (status === 'review') {
    query = query.in('status', ['unmatched', 'ambiguous'])
  } else if (status !== 'all') {
    query = query.eq('status', status)
  }

  const { data: aliases, error } = await query
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  const [{ data: channels }, { data: members }] = await Promise.all([
    (serviceClient as any)
      .from('sapo_channels')
      .select('id, alias, platform, branch_name, branch_external_id, orders_count')
      .order('orders_count', { ascending: false }),
    serviceClient
      .from('sapo_members')
      .select('sapo_user_id, full_name, prefix_code, is_media_team')
      .eq('is_media_team', true)
      .order('full_name', { ascending: true }),
  ])

  return NextResponse.json({
    aliases: aliases || [],
    channels: channels || [],
    members: members || [],
    summary: {
      total: aliases?.length || 0,
      unmatched: (aliases || []).filter((a: any) => a.status === 'unmatched').length,
      ambiguous: (aliases || []).filter((a: any) => a.status === 'ambiguous').length,
    },
  })
}

export async function PATCH(request: NextRequest) {
  const auth = await requireEditor()
  if (auth.error) return auth.error

  const body = await request.json().catch(() => ({})) as {
    alias_id?: string
    channel_id?: string | null
    owner_member_id?: number | null
    status?: 'matched' | 'ignored' | 'unmatched' | 'ambiguous'
    notes?: string | null
  }

  if (!body.alias_id) {
    return NextResponse.json({ error: 'Cần alias_id' }, { status: 400 })
  }

  const serviceClient = await createServiceClient()
  const status = body.status || (body.channel_id ? 'matched' : 'ignored')
  const confidence = status === 'matched' ? 'manual' : status === 'ignored' ? 'ignored' : 'review'

  const update: Record<string, unknown> = {
    channel_id: body.channel_id ?? null,
    owner_member_id: body.owner_member_id ?? null,
    status,
    confidence,
    notes: body.notes ?? null,
  }

  const { data: alias, error } = await (serviceClient as any)
    .from('sapo_channel_aliases')
    .update(update)
    .eq('id', body.alias_id)
    .select('id, alias_text, normalized_alias, channel_id, owner_member_id, status')
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  if (status === 'matched' && body.channel_id && body.owner_member_id) {
    const { error: channelError } = await (serviceClient as any)
      .from('sapo_channels')
      .update({ media_member_id: body.owner_member_id })
      .eq('id', body.channel_id)
    if (channelError) return NextResponse.json({ error: channelError.message }, { status: 500 })
  }

  return NextResponse.json({ ok: true, alias })
}

export async function POST(request: NextRequest) {
  const auth = await requireEditor()
  if (auth.error) return auth.error

  const body = await request.json().catch(() => ({})) as {
    alias_text?: string
    platform?: string | null
    channel_id?: string | null
    owner_member_id?: number | null
    source?: string | null
    notes?: string | null
  }

  const aliasText = String(body.alias_text || '').trim()
  if (!aliasText) return NextResponse.json({ error: 'Cần alias_text' }, { status: 400 })

  const serviceClient = await createServiceClient()
  const row = {
    alias_text: aliasText,
    normalized_alias: normalize(aliasText),
    platform: body.platform || null,
    platform_key: body.platform || '',
    channel_id: body.channel_id || null,
    owner_member_id: body.owner_member_id || null,
    source: body.source || 'manual',
    confidence: body.channel_id ? 'manual' : 'review',
    status: body.channel_id ? 'matched' : 'unmatched',
    notes: body.notes || null,
  }

  const { data, error } = await (serviceClient as any)
    .from('sapo_channel_aliases')
    .upsert(row, { onConflict: 'source,normalized_alias,platform_key' })
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true, alias: data })
}
