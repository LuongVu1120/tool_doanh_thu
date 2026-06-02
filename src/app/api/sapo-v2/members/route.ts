export const dynamic = 'force-dynamic'

import { NextRequest, NextResponse } from 'next/server'
import crypto from 'crypto'
import { createClient, createServiceClient } from '@/lib/supabase/server'

function normalize(value: string) {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/đ/g, 'd')
    .replace(/Đ/g, 'D')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
}

function stableExternalMemberId(fullName: string, prefixCode: string | null) {
  const source = normalize(prefixCode || fullName)
  const hash = crypto.createHash('sha1').update(source).digest().readUInt32BE(0)
  return -1_000_000_000 - hash
}

export async function GET(request: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Chưa đăng nhập' }, { status: 401 })

  const url = new URL(request.url)
  const mediaOnly = url.searchParams.get('media') === '1'

  let query = supabase
    .from('sapo_members')
    .select('sapo_user_id, full_name, email, prefix_code, is_media_team, is_active, phone_number')
    .order('full_name', { ascending: true })

  if (mediaOnly) query = query.eq('is_media_team', true)

  const { data, error } = await query
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ members: data })
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
  if (!profile || profile.role !== 'admin') {
    return NextResponse.json({ error: 'Chỉ admin được phép' }, { status: 403 })
  }

  const body = await request.json().catch(() => ({})) as {
    sapo_user_id?: number
    is_media_team?: boolean
    toggles?: Array<{ sapo_user_id: number; is_media_team: boolean }>
  }

  const serviceClient = await createServiceClient()
  const updates = body.toggles || (body.sapo_user_id !== undefined ? [{ sapo_user_id: body.sapo_user_id, is_media_team: body.is_media_team ?? false }] : [])
  if (updates.length === 0) {
    return NextResponse.json({ error: 'Cần sapo_user_id + is_media_team hoặc toggles[]' }, { status: 400 })
  }

  const results: Array<{ id: number; ok: boolean; error?: string }> = []
  for (const u of updates) {
    const { error } = await serviceClient
      .from('sapo_members')
      .update({ is_media_team: u.is_media_team })
      .eq('sapo_user_id', u.sapo_user_id)
    results.push({ id: u.sapo_user_id, ok: !error, error: error?.message })
  }
  return NextResponse.json({ ok: true, results })
}

export async function POST(request: NextRequest) {
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
    full_name?: string
    prefix_code?: string | null
    email?: string | null
  }

  const fullName = String(body.full_name || '').trim().replace(/\s+/g, ' ')
  const prefixCode = String(body.prefix_code || '').trim().replace(/\s+/g, ' ') || null
  const email = String(body.email || '').trim() || null

  if (!fullName) {
    return NextResponse.json({ error: 'Cần nhập tên nhân sự' }, { status: 400 })
  }
  if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return NextResponse.json({ error: 'Email không hợp lệ' }, { status: 400 })
  }

  const serviceClient = await createServiceClient()
  const now = new Date().toISOString()
  const memberId = stableExternalMemberId(fullName, prefixCode)
  const row = {
    sapo_user_id: memberId,
    email,
    first_name: null,
    last_name: fullName,
    full_name: fullName,
    phone_number: null,
    prefix_code: prefixCode,
    is_media_team: true,
    is_active: true,
    last_synced_at: now,
    raw: {
      source: 'manual_external_media',
      created_by: user.id,
      created_at: now,
    },
  }

  const { data, error } = await serviceClient
    .from('sapo_members')
    .upsert(row, { onConflict: 'sapo_user_id' })
    .select('sapo_user_id, full_name, email, prefix_code, is_media_team, is_active, phone_number')
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true, member: data })
}
