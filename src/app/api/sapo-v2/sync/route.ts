export const dynamic = 'force-dynamic'
export const maxDuration = 300

import { NextRequest, NextResponse } from 'next/server'
import { createClient, createServiceClient } from '@/lib/supabase/server'
import { getEnvSapoV2Auth } from '@/lib/sapo-v2/client'
import { syncSapoMembers, syncSapoOrders } from '@/lib/sapo-v2/sync'

export async function POST(request: NextRequest) {
  const supabase = await createClient()
  const { data: { user }, error } = await supabase.auth.getUser()
  if (error || !user) {
    return NextResponse.json({ error: 'Chưa đăng nhập' }, { status: 401 })
  }

  const auth = getEnvSapoV2Auth()
  if (!auth) {
    return NextResponse.json(
      { error: 'Thiếu cấu hình Sapo. Cần SAPO_STORE + (SAPO_API_KEY+SAPO_API_SECRET) trong .env' },
      { status: 400 }
    )
  }

  const url = new URL(request.url)
  const max = url.searchParams.get('max')
  const days = url.searchParams.get('days')
  const sinceParam = url.searchParams.get('since') // ISO datetime
  const incremental = url.searchParams.get('incremental') === '1'
  const onlyMembers = url.searchParams.get('only') === 'members'

  const serviceClient = await createServiceClient()

  try {
    const membersResult = await syncSapoMembers(serviceClient, auth)

    if (onlyMembers) {
      return NextResponse.json({ ok: true, members: membersResult })
    }

    let createdOnMin: string | null = null
    let modifiedOnMin: string | null = null

    if (incremental) {
      const { data: state } = await serviceClient
        .from('sapo_sync_state')
        .select('orders_cursor_modified_on')
        .eq('store', auth.store)
        .maybeSingle()
      modifiedOnMin = state?.orders_cursor_modified_on ?? null
    } else if (sinceParam) {
      createdOnMin = sinceParam
    } else if (days) {
      const since = new Date()
      since.setDate(since.getDate() - parseInt(days, 10))
      createdOnMin = since.toISOString()
    }

    const ordersResult = await syncSapoOrders(serviceClient, auth, {
      createdOnMin,
      modifiedOnMin,
      maxOrders: max ? parseInt(max, 10) : undefined,
    })

    return NextResponse.json({
      ok: true,
      members: membersResult,
      orders: ordersResult,
    })
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Sync failed'
    await serviceClient
      .from('sapo_sync_state')
      .upsert({ store: auth.store, last_error: message }, { onConflict: 'store' })
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
