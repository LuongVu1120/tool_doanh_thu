export const dynamic = 'force-dynamic'

import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

interface RouteContext {
  params: Promise<{ period: string }>
}

export async function POST(request: NextRequest, context: RouteContext) {
  try {
    const { period } = await context.params
    const supabase = await createClient()

    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser()

    if (authError || !user) {
      return NextResponse.json({ error: 'Chưa đăng nhập' }, { status: 401 })
    }

    // Check admin role
    const { data: profile } = await supabase
      .from('users')
      .select('role')
      .eq('id', user.id)
      .single()

    if (!profile || profile.role !== 'admin') {
      return NextResponse.json({ error: 'Không có quyền khóa kỳ' }, { status: 403 })
    }

    if (!/^\d{4}-\d{2}$/.test(period)) {
      return NextResponse.json({ error: 'Kỳ không hợp lệ' }, { status: 400 })
    }

    const body = await request.json().catch(() => ({}))
    const notes = body.notes || null

    // Check if already locked
    const { data: existing } = await supabase
      .from('period_locks')
      .select('period')
      .eq('period', period)
      .single()

    if (existing) {
      return NextResponse.json({ error: 'Kỳ này đã bị khóa' }, { status: 400 })
    }

    // Create lock record
    const { error: lockError } = await supabase.from('period_locks').insert({
      period,
      locked_by: user.id,
      notes,
    })

    if (lockError) {
      return NextResponse.json({ error: 'Lỗi khi khóa kỳ' }, { status: 500 })
    }

    // Mark all orders in this period as locked using completion_date range
    const periodStart = `${period}-01`
    const periodEnd = `${period}-31`

    await supabase
      .from('orders')
      .update({ period_locked: true })
      .gte('completion_date', periodStart)
      .lte('completion_date', periodEnd)

    return NextResponse.json({ success: true, period })
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Lỗi server' },
      { status: 500 }
    )
  }
}

export async function DELETE(request: NextRequest, context: RouteContext) {
  try {
    const { period } = await context.params
    const supabase = await createClient()

    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser()

    if (authError || !user) {
      return NextResponse.json({ error: 'Chưa đăng nhập' }, { status: 401 })
    }

    const { data: profile } = await supabase
      .from('users')
      .select('role')
      .eq('id', user.id)
      .single()

    if (!profile || profile.role !== 'admin') {
      return NextResponse.json({ error: 'Không có quyền mở khóa kỳ' }, { status: 403 })
    }

    await supabase.from('period_locks').delete().eq('period', period)

    const periodStart = `${period}-01`
    const periodEnd = `${period}-31`

    await supabase
      .from('orders')
      .update({ period_locked: false })
      .gte('completion_date', periodStart)
      .lte('completion_date', periodEnd)

    return NextResponse.json({ success: true, period })
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Lỗi server' },
      { status: 500 }
    )
  }
}
