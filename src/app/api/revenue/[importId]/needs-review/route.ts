export const dynamic = 'force-dynamic'

import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

interface RouteContext {
  params: Promise<{ importId: string }>
}

export async function GET(request: NextRequest, context: RouteContext) {
  try {
    const { importId } = await context.params
    const supabase = await createClient()

    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser()

    if (authError || !user) {
      return NextResponse.json({ error: 'Chưa đăng nhập' }, { status: 401 })
    }

    // Fetch the import record to verify it exists
    const { data: importRecord, error: importError } = await supabase
      .from('revenue_imports')
      .select('id, status')
      .eq('id', importId)
      .single()

    if (importError || !importRecord) {
      return NextResponse.json({ error: 'Không tìm thấy import' }, { status: 404 })
    }

    // Fetch orders that have no employee assigned (needs review)
    const { data: orders, error } = await supabase
      .from('orders')
      .select('order_code, source, total_amount, notes, raw_tags, completion_date')
      .is('employee_id', null)
      .order('completion_date', { ascending: false })

    if (error) {
      return NextResponse.json({ error: 'Lỗi truy vấn' }, { status: 500 })
    }

    const mappedOrders = (orders || []).map((o) => ({
      orderCode: o.order_code,
      source: o.source,
      status: 'Đã hoàn thành',
      totalAmount: o.total_amount,
      notes: o.notes || '',
      tags: o.raw_tags ? o.raw_tags.split(',').map((t: string) => t.trim()) : [],
      completedAt: o.completion_date,
      rawTags: o.raw_tags || '',
      importId,
    }))

    return NextResponse.json({ orders: mappedOrders })
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Lỗi server' },
      { status: 500 }
    )
  }
}
