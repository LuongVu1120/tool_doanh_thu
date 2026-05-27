export const dynamic = 'force-dynamic'

import { NextRequest, NextResponse } from 'next/server'
import { createClient, createServiceClient } from '@/lib/supabase/server'
import { GOLDEN_APRIL_2026_ADJUSTMENTS } from '@/lib/revenue/golden-april-2026'

interface AdjustmentPayload {
  period: string
  employeeName?: string
  employee_name?: string
  channelGroup?: string
  channel_group?: string
  channelName?: string
  channel_name?: string
  amount: number
  reason?: string | null
  sourceLabel?: string | null
  source_label?: string | null
}

export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient()
    const { data: { user }, error: authError } = await supabase.auth.getUser()
    if (authError || !user) {
      return NextResponse.json({ error: 'Chưa đăng nhập' }, { status: 401 })
    }

    const body = await request.json().catch(() => ({}))
    const useGoldenApril = body.useGoldenApril === true
    const adjustments: AdjustmentPayload[] = useGoldenApril
      ? GOLDEN_APRIL_2026_ADJUSTMENTS
      : body.adjustments || []

    if (!Array.isArray(adjustments) || adjustments.length === 0) {
      return NextResponse.json({ error: 'Không có adjustment nào để import' }, { status: 400 })
    }

    const rows = adjustments.map((a) => ({
      period: a.period,
      employee_name: a.employee_name ?? a.employeeName ?? '',
      channel_group: a.channel_group ?? a.channelGroup ?? 'MANUAL',
      channel_name: a.channel_name ?? a.channelName ?? 'Manual adjustment',
      amount: Math.round(Number(a.amount || 0)),
      reason: a.reason ?? null,
      source_label: a.source_label ?? a.sourceLabel ?? null,
      created_by: user.id,
    })).filter((a) => a.period && a.employee_name && a.amount !== 0)

    if (rows.length === 0) {
      return NextResponse.json({ error: 'Adjustment không hợp lệ' }, { status: 400 })
    }

    const serviceClient = await createServiceClient()

    const sourceLabels = [
      ...new Set(rows.map((row) => row.source_label).filter((label): label is string => Boolean(label))),
    ]
    const periods = [...new Set(rows.map((row) => row.period))]

    for (const period of periods) {
      for (const sourceLabel of sourceLabels) {
        const { error: deleteError } = await serviceClient
          .from('revenue_adjustments')
          .delete()
          .eq('period', period)
          .eq('source_label', sourceLabel)

        if (deleteError) {
          return NextResponse.json({ error: deleteError.message }, { status: 500 })
        }
      }
    }

    const { error } = await serviceClient.from('revenue_adjustments').insert(rows)
    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    return NextResponse.json({ inserted: rows.length })
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Lỗi server' },
      { status: 500 }
    )
  }
}
