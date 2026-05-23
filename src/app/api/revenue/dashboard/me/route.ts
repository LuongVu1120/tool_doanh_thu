export const dynamic = 'force-dynamic'

import { NextRequest, NextResponse } from 'next/server'
import { createClient, createServiceClient } from '@/lib/supabase/server'
import { getPreviousPeriod, getNextPeriod, getPeriodLabel } from '@/lib/utils'

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
    const period = searchParams.get('period') || new Date().toISOString().slice(0, 7)

    // Use exclusive upper bound (first day of next month) to avoid last-day timezone bugs
    const periodStart = `${period}-01`
    const periodNext  = `${getNextPeriod(period)}-01`

    // Get user's full_name to match against orders.employee_name
    const serviceClient = await createServiceClient()
    const { data: profile } = await serviceClient
      .from('users')
      .select('full_name')
      .eq('id', user.id)
      .maybeSingle()

    const employeeName = profile?.full_name || null

    if (!employeeName) {
      return NextResponse.json({
        stats: {
          period,
          revenue: 0,
          orders: 0,
          isLocked: false,
          kpiTarget: null,
          employeeName: null,
          noNameSet: true,
        },
        history: [],
      })
    }

    const { data: orders } = await supabase
      .from('orders')
      .select('total_amount, is_returned, period_locked, completion_date')
      .eq('employee_name', employeeName)
      .gte('completion_date', periodStart)
      .lt('completion_date', periodNext)

    const validOrders = (orders || []).filter((o) => !o.is_returned)
    const revenue = validOrders.reduce((sum, o) => sum + (o.total_amount || 0), 0)
    const ordersCount = validOrders.length
    const isLocked = validOrders.some((o) => o.period_locked)

    const { data: kpi } = await supabase
      .from('kpi_targets')
      .select('target_amount')
      .eq('employee_id', user.id)
      .eq('period', period)
      .maybeSingle()

    // Build history (last 6 months)
    const history = []
    let p = period
    for (let i = 0; i < 6; i++) {
      const pStart = `${p}-01`
      const pNext  = `${getNextPeriod(p)}-01`

      const { data: periodOrders } = await supabase
        .from('orders')
        .select('total_amount, is_returned, period_locked')
        .eq('employee_name', employeeName)
        .gte('completion_date', pStart)
        .lt('completion_date', pNext)

      const periodRevenue = (periodOrders || []).reduce((sum, o) => {
        if (o.is_returned) return sum
        return sum + (o.total_amount || 0)
      }, 0)
      const periodLocked = (periodOrders || []).some((o) => o.period_locked)

      history.unshift({
        period: p,
        label: getPeriodLabel(p),
        revenue: periodRevenue,
        orders: (periodOrders || []).filter((o) => !o.is_returned).length,
        isLocked: periodLocked,
      })

      p = getPreviousPeriod(p)
    }

    return NextResponse.json({
      stats: {
        period,
        revenue,
        orders: ordersCount,
        isLocked,
        kpiTarget: kpi?.target_amount || null,
        employeeName,
      },
      history,
    })
  } catch (error) {
    console.error('Dashboard me error:', error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Lỗi server' },
      { status: 500 }
    )
  }
}
