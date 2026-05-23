export const dynamic = 'force-dynamic'

import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
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

    const periodStart = `${period}-01`
    const periodNext  = `${getNextPeriod(period)}-01`

    const { data: orders } = await supabase
      .from('orders')
      .select('employee_name, total_amount, is_returned, period_locked')
      .gte('completion_date', periodStart)
      .lt('completion_date', periodNext)

    if (!orders) {
      return NextResponse.json({
        stats: { totalRevenue: 0, totalOrders: 0, isLocked: false, employeeStats: [] },
        history: [],
      })
    }

    const validOrders = orders.filter((o) => !o.is_returned)

    const employeeMap = new Map<string, { revenue: number; orders: number }>()
    for (const order of validOrders) {
      const name = order.employee_name || 'CHƯA GÁN'
      const existing = employeeMap.get(name) || { revenue: 0, orders: 0 }
      employeeMap.set(name, {
        revenue: existing.revenue + (order.total_amount || 0),
        orders: existing.orders + 1,
      })
    }

    const employeeStats = [...employeeMap.entries()]
      .map(([name, stats]) => ({
        employeeName: name,
        name,
        revenue: stats.revenue,
        orders: stats.orders,
      }))
      .sort((a, b) => b.revenue - a.revenue)

    const totalRevenue = validOrders.reduce((sum, o) => sum + (o.total_amount || 0), 0)
    const isLocked = orders.some((o) => o.period_locked)

    // Build history (last 6 months)
    const history = []
    let p = period
    for (let i = 0; i < 6; i++) {
      const pStart = `${p}-01`
      const pNext  = `${getNextPeriod(p)}-01`

      const { data: periodOrders } = await supabase
        .from('orders')
        .select('total_amount, is_returned, period_locked')
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
        totalRevenue,
        totalOrders: validOrders.length,
        isLocked,
        employeeStats,
      },
      history,
    })
  } catch (error) {
    console.error('Team dashboard error:', error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Lỗi server' },
      { status: 500 }
    )
  }
}
