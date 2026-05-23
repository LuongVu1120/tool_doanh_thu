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

    const { data: importRecord, error } = await supabase
      .from('revenue_imports')
      .select('*')
      .eq('id', importId)
      .single()

    if (error || !importRecord) {
      return NextResponse.json({ error: 'Không tìm thấy import' }, { status: 404 })
    }

    return NextResponse.json({
      import: importRecord,
    })
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Lỗi server' },
      { status: 500 }
    )
  }
}
