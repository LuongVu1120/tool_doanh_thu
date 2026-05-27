export const dynamic = 'force-dynamic'

import { NextRequest, NextResponse } from 'next/server'
import { createClient, createServiceClient } from '@/lib/supabase/server'
import { getPreviousPeriod, getNextPeriod, getPeriodLabel } from '@/lib/utils'
import { buildRevenueReport, normalizeEmployeeName } from '@/lib/revenue/report-engine'

const ORDER_SELECT = 'order_code, source, status, channel_tag_matched, employee_name, completion_date, total_amount, recognized_amount, is_returned, review_status, period_locked'
const ADJUSTMENT_SELECT = 'period, employee_name, channel_group, channel_name, amount, reason, source_label'

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

    const serviceClient = await createServiceClient()
    const { data: profile } = await serviceClient
      .from('users')
      .select('full_name')
      .eq('id', user.id)
      .maybeSingle()

    const employeeName = normalizeEmployeeName(profile?.full_name)

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

    const periodStart = `${period}-01`
    const periodNext = `${getNextPeriod(period)}-01`

    const { data: orders } = await supabase
      .from('orders')
      .select(ORDER_SELECT)
      .gte('completion_date', periodStart)
      .lt('completion_date', periodNext)

    const { data: adjustments } = await supabase
      .from('revenue_adjustments')
      .select(ADJUSTMENT_SELECT)
      .eq('period', period)

    const report = buildRevenueReport(period, orders || [], adjustments || [])
    const revenue = report.employeeTotals[employeeName] ?? 0
    const ordersCount = report.rows
      .filter((r) => r.source === 'orders' && r.employeeName === employeeName)
      .reduce((sum, r) => sum + r.orderCount, 0)

    const { data: kpi } = await supabase
      .from('kpi_targets')
      .select('target_amount')
      .eq('employee_id', user.id)
      .eq('period', period)
      .maybeSingle()

    const history = []
    let p = period
    for (let i = 0; i < 6; i++) {
      const pStart = `${p}-01`
      const pNext = `${getNextPeriod(p)}-01`

      const { data: periodOrders } = await supabase
        .from('orders')
        .select(ORDER_SELECT)
        .gte('completion_date', pStart)
        .lt('completion_date', pNext)

      const { data: periodAdjustments } = await supabase
        .from('revenue_adjustments')
        .select(ADJUSTMENT_SELECT)
        .eq('period', p)

      const periodReport = buildRevenueReport(p, periodOrders || [], periodAdjustments || [])

      history.unshift({
        period: p,
        label: getPeriodLabel(p),
        revenue: periodReport.employeeTotals[employeeName] ?? 0,
        orders: periodReport.rows
          .filter((r) => r.source === 'orders' && r.employeeName === employeeName)
          .reduce((sum, r) => sum + r.orderCount, 0),
        isLocked: periodReport.isLocked,
      })

      p = getPreviousPeriod(p)
    }

    return NextResponse.json({
      stats: {
        period,
        revenue,
        orders: ordersCount,
        isLocked: report.isLocked,
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
