export const dynamic = 'force-dynamic'

import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import type { Json } from '@/types/database'

interface RouteContext {
  params: Promise<{ importId: string }>
}

interface Resolution {
  action: 'include' | 'exclude'
  employeeId?: string
  employeeName?: string
  amount?: number
}

export async function POST(request: NextRequest, context: RouteContext) {
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

    const body = await request.json()
    const resolutions: Record<string, Resolution> = body.resolutions || {}

    if (Object.keys(resolutions).length === 0) {
      return NextResponse.json({ error: 'Không có resolution nào' }, { status: 400 })
    }

    // Process each resolution — assign employee or clear
    const updates: Promise<unknown>[] = []

    for (const [orderCode, resolution] of Object.entries(resolutions)) {
      if (resolution.action === 'include') {
        updates.push(
          Promise.resolve(
            supabase
              .from('orders')
              .update({
                employee_id: resolution.employeeId ?? null,
                employee_name: resolution.employeeName ?? undefined,
                recognized_amount: resolution.amount ?? undefined,
                review_status: 'included',
                review_resolution: resolution as unknown as Json,
              })
              .eq('order_code', orderCode)
          )
        )
      }
      if (resolution.action === 'exclude') {
        updates.push(
          Promise.resolve(
            supabase
              .from('orders')
              .update({
                recognized_amount: 0,
                review_status: 'excluded',
                review_resolution: resolution as unknown as Json,
              })
              .eq('order_code', orderCode)
          )
        )
      }
    }

    await Promise.all(updates)

    return NextResponse.json({ success: true, resolvedCount: Object.keys(resolutions).length })
  } catch (error) {
    console.error('Resolve error:', error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Lỗi server' },
      { status: 500 }
    )
  }
}
