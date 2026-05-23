export const dynamic = 'force-dynamic'

import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

interface RouteContext {
  params: Promise<{ importId: string }>
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

    // Fetch the import record
    const { data: importRecord, error: fetchError } = await supabase
      .from('revenue_imports')
      .select('*')
      .eq('id', importId)
      .single()

    if (fetchError || !importRecord) {
      return NextResponse.json({ error: 'Không tìm thấy bản ghi import' }, { status: 404 })
    }

    if (importRecord.status !== 'processing') {
      return NextResponse.json(
        { error: `Không thể xác nhận import ở trạng thái: ${importRecord.status}` },
        { status: 400 }
      )
    }

    // Update import status to done
    const { error: updateError } = await supabase
      .from('revenue_imports')
      .update({ status: 'done' })
      .eq('id', importId)

    if (updateError) {
      console.error('Update import error:', updateError)
      return NextResponse.json({ error: 'Lỗi khi cập nhật trạng thái' }, { status: 500 })
    }

    return NextResponse.json({ success: true, importId })
  } catch (error) {
    console.error('Confirm error:', error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Lỗi server' },
      { status: 500 }
    )
  }
}
