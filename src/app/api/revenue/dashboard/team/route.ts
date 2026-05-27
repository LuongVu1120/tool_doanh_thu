export const dynamic = 'force-dynamic'

import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { getPreviousPeriod, getNextPeriod, getPeriodLabel } from '@/lib/utils'
import {
  buildEmployeeStats,
  buildRevenueReport,
  reconcileWithGoldenApril2026,
} from '@/lib/revenue/report-engine'
import { GOLDEN_APRIL_2026_PERIOD } from '@/lib/revenue/golden-april-2026'

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
    const mode = searchParams.get('mode')
    const pdfMode = mode === 'pdf' && period === GOLDEN_APRIL_2026_PERIOD

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
    const { employeeStats, extraEmployeeStats } = buildEmployeeStats(report, {
      goldenPdfOnly: pdfMode,
    })
    const reconciliation = pdfMode ? reconcileWithGoldenApril2026(report) : null

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
        revenue: periodReport.grandTotal,
        orders: periodReport.orderCount,
        isLocked: periodReport.isLocked,
      })

      p = getPreviousPeriod(p)
    }

    return NextResponse.json({
      stats: {
        totalRevenue: report.grandTotal,
        totalOrders: report.orderCount,
        isLocked: report.isLocked,
        employeeStats,
        extraEmployeeStats,
        pendingReviewCount: report.pendingReviewCount,
        reconciliation,
        mode: pdfMode ? 'pdf' : 'standard',
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
