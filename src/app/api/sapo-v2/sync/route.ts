export const dynamic = 'force-dynamic'
export const maxDuration = 300

import { NextRequest, NextResponse } from 'next/server'
import { createClient, createServiceClient } from '@/lib/supabase/server'
import { getEnvSapoV2Auth } from '@/lib/sapo-v2/client'
import { syncSapoMembers, syncSapoOrders } from '@/lib/sapo-v2/sync'

const SYNC_OVERLAP_MINUTES = 10

export async function GET(request: NextRequest) {
  if (!isCronAuthorized(request)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  return runSync(request, { defaultIncremental: true })
}

export async function POST(request: NextRequest) {
  const supabase = await createClient()
  const { data: { user }, error } = await supabase.auth.getUser()
  if (error || !user) {
    return NextResponse.json({ error: 'Chưa đăng nhập' }, { status: 401 })
  }
  return runSync(request, { defaultIncremental: false })
}

async function runSync(
  request: NextRequest,
  options: { defaultIncremental: boolean }
) {
  const auth = getEnvSapoV2Auth()
  if (!auth) {
    return NextResponse.json(
      { error: 'Thiếu cấu hình Sapo. Cần SAPO_STORE + SAPO_API_KEY + SAPO_API_SECRET hoặc SAPO_ACCESS_TOKEN.' },
      { status: 400 }
    )
  }

  const url = new URL(request.url)
  const max = url.searchParams.get('max')
  const days = url.searchParams.get('days')
  const sinceParam = url.searchParams.get('since') // ISO datetime
  const incrementalParam = url.searchParams.get('incremental')
  const full = url.searchParams.get('full') === '1'
  const onlyMembers = url.searchParams.get('only') === 'members'
  const incremental = full
    ? false
    : incrementalParam === null
      ? options.defaultIncremental
      : incrementalParam === '1'

  const serviceClient = await createServiceClient()

  try {
    const membersResult = await syncSapoMembers(serviceClient, auth)

    if (onlyMembers) {
      return NextResponse.json({ ok: true, members: membersResult })
    }

    let createdOnMin: string | null = null
    let modifiedOnMin: string | null = null
    let cursorFloor: string | null = null

    if (incremental) {
      const { data: state } = await serviceClient
        .from('sapo_sync_state')
        .select('orders_cursor_modified_on')
        .eq('store', auth.store)
        .maybeSingle()
      cursorFloor = state?.orders_cursor_modified_on ?? null
      modifiedOnMin = getOverlappedCursor(cursorFloor)
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
      cursorFloor,
      maxOrders: max ? parseInt(max, 10) : undefined,
    })

    return NextResponse.json({
      ok: true,
      mode: incremental ? 'incremental' : 'backfill',
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

function getOverlappedCursor(cursor: string | null): string | null {
  if (!cursor) return null
  const date = new Date(cursor)
  if (Number.isNaN(date.getTime())) return cursor
  date.setMinutes(date.getMinutes() - SYNC_OVERLAP_MINUTES)
  return date.toISOString()
}

function isCronAuthorized(request: NextRequest): boolean {
  const secret = process.env.CRON_SECRET
  if (request.headers.get('x-vercel-cron') === '1') return true
  if (!secret) return true
  const auth = request.headers.get('authorization')
  const querySecret = new URL(request.url).searchParams.get('secret')
  return auth === `Bearer ${secret}` || querySecret === secret
}
