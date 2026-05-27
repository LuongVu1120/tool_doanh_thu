export const dynamic = 'force-dynamic'

import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { getNextPeriod } from '@/lib/utils'
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
    const { data: { user }, error: authError } = await supabase.auth.getUser()
    if (authError || !user) {
      return NextResponse.json({ error: 'Chưa đăng nhập' }, { status: 401 })
    }

    const { searchParams } = new URL(request.url)
    const period = searchParams.get('period') || new Date().toISOString().slice(0, 7)
    const mode = searchParams.get('mode')
    const pdfMode = mode === 'pdf' && period === GOLDEN_APRIL_2026_PERIOD
    if (!/^\d{4}-\d{2}$/.test(period)) {
      return NextResponse.json({ error: 'Kỳ không hợp lệ' }, { status: 400 })
    }

    const { data: orders, error: ordersError } = await supabase
      .from('orders')
      .select(ORDER_SELECT)
      .gte('completion_date', `${period}-01`)
      .lt('completion_date', `${getNextPeriod(period)}-01`)

    if (ordersError) {
      return NextResponse.json({ error: ordersError.message }, { status: 500 })
    }

    const { data: adjustments, error: adjustmentsError } = await supabase
      .from('revenue_adjustments')
      .select(ADJUSTMENT_SELECT)
      .eq('period', period)

    if (adjustmentsError) {
      return NextResponse.json({ error: adjustmentsError.message }, { status: 500 })
    }

    const report = buildRevenueReport(period, orders || [], adjustments || [])
    const employeeView = buildEmployeeStats(report, { goldenPdfOnly: pdfMode })

    return NextResponse.json({
      report,
      employeeView,
      reconciliation: pdfMode ? reconcileWithGoldenApril2026(report) : null,
      mode: pdfMode ? 'pdf' : 'standard',
    })
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Lỗi server' },
      { status: 500 }
    )
  }
}
