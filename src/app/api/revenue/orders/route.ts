export const dynamic = 'force-dynamic'

import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

export async function GET(request: NextRequest) {
  try {
    const supabase = await createClient()

    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser()

    if (authError || !user) {
      return NextResponse.json({ error: 'Chưa đăng nhập' }, { status: 401 })
    }

    const { searchParams } = new URL(request.url)
    const type = searchParams.get('type')
    const period = searchParams.get('period') // "YYYY-MM"
    const employeeId = searchParams.get('employeeId')

    // Special: return employees list
    if (type === 'employees') {
      const { data: users } = await supabase
        .from('users')
        .select('id, full_name')
        .eq('role', 'media')
        .order('full_name')

      const employees = (users || []).map((u) => ({
        id: u.id,
        name: u.full_name || u.id,
      }))

      return NextResponse.json({ employees })
    }

    // Build query
    let query = supabase
      .from('orders')
      .select('*')
      .order('completion_date', { ascending: false })

    if (period) {
      const periodStart = `${period}-01`
      const periodEnd = `${period}-31`
      query = query.gte('completion_date', periodStart).lte('completion_date', periodEnd)
    }

    if (employeeId) {
      query = query.eq('employee_id', employeeId)
    } else if (type === 'my') {
      query = query.eq('employee_id', user.id)
    }

    const limit = parseInt(searchParams.get('limit') || '100', 10)
    const offset = parseInt(searchParams.get('offset') || '0', 10)
    query = query.range(offset, offset + limit - 1)

    const { data: orders, error } = await query

    if (error) {
      return NextResponse.json({ error: 'Lỗi truy vấn' }, { status: 500 })
    }

    return NextResponse.json({ orders: orders || [] })
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Lỗi server' },
      { status: 500 }
    )
  }
}
