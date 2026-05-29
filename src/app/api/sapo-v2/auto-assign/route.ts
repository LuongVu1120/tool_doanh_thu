export const dynamic = 'force-dynamic'

import { NextRequest, NextResponse } from 'next/server'
import { createClient, createServiceClient } from '@/lib/supabase/server'

/**
 * GET /api/sapo-v2/auto-assign?member_ids=1,2,3
 *
 * Trả về ngữ cảnh đầy đủ cho mỗi kênh:
 *   - top creator/assignee (bất kỳ team) — giúp user thấy đội nào đang xử lý đơn kênh đó
 *   - top Media creator (nếu có) — auto-suggest cho user khi tồn tại
 *
 * Mục đích: hỗ trợ user gán media member theo nhiều chiến lược (lịch sử đơn,
 * theo brand, theo platform...), thay vì chỉ auto-assign 1 chiều.
 */
export async function GET(request: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Chưa đăng nhập' }, { status: 401 })

  const url = new URL(request.url)
  const raw = url.searchParams.get('member_ids') || ''
  const memberIds = raw
    .split(',')
    .map((s) => Number(s.trim()))
    .filter((n) => Number.isFinite(n) && n > 0)

  if (memberIds.length === 0) {
    return NextResponse.json(
      { error: 'Cần cung cấp ?member_ids=1,2,3 (danh sách sapo_user_id thuộc đội Media).' },
      { status: 400 }
    )
  }

  const serviceClient = await createServiceClient()
  const { data, error } = await serviceClient.rpc('rpc_channel_owner_context', {
    p_media_ids: memberIds,
  })
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  const rows = data || []
  const summary = {
    total_channels: rows.length,
    has_media_creator: rows.filter((r) => r.top_media_creator_id !== null).length,
    no_media_creator: rows.filter((r) => r.top_media_creator_id === null).length,
  }

  return NextResponse.json({
    contexts: rows,
    summary,
    member_ids: memberIds,
  })
}
