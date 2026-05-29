export const dynamic = 'force-dynamic'
export const maxDuration = 60

import { NextRequest, NextResponse } from 'next/server'
import { createClient, createServiceClient } from '@/lib/supabase/server'
import { getEnvSapoConnection } from '@/lib/sapo-api/client'
import { syncSapoConnection } from '@/lib/sapo-api/sync'
import type { SapoConnection } from '@/lib/sapo-api/types'

export async function GET(request: NextRequest) {
  if (!isCronAuthorized(request)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  return runSync(request)
}

export async function POST(request: NextRequest) {
  const supabase = await createClient()
  const { data: { user }, error } = await supabase.auth.getUser()
  if (error || !user) {
    return NextResponse.json({ error: 'Chưa đăng nhập' }, { status: 401 })
  }
  return runSync(request)
}

async function runSync(request: NextRequest) {
  const serviceClient = await createServiceClient()
  const { searchParams } = new URL(request.url)
  const store = searchParams.get('store')
  const full = searchParams.get('full') === '1'
  const envConnection = getEnvSapoConnection()

  if (envConnection && (!store || store === envConnection.store)) {
    const connection = await loadEnvConnectionWithCursor(serviceClient, envConnection)
    const result = await syncSapoConnection(serviceClient, connection, { full })
    return NextResponse.json({ results: [result], mode: 'private_token' })
  }

  let query = serviceClient
    .from('sapo_connections')
    .select('id, store, access_token, scopes, connected_by, last_sync_at, sync_cursor_modified_on')
    .order('created_at', { ascending: false })

  if (store) query = query.eq('store', store)

  const { data: connections, error } = await query
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  if (!connections || connections.length === 0) {
    return NextResponse.json({ results: [], message: 'Chưa có kết nối Sapo' })
  }

  const results = []
  for (const connection of connections as SapoConnection[]) {
    results.push(await syncSapoConnection(serviceClient, connection, { full }))
  }

  return NextResponse.json({ results })
}

async function loadEnvConnectionWithCursor(
  serviceClient: Awaited<ReturnType<typeof createServiceClient>>,
  envConnection: SapoConnection
): Promise<SapoConnection> {
  const { data } = await serviceClient
    .from('sapo_connections')
    .select('id, store, scopes, connected_by, last_sync_at, sync_cursor_modified_on')
    .eq('store', envConnection.store)
    .maybeSingle()

  if (data) {
    return {
      ...envConnection,
      id: data.id,
      scopes: data.scopes || envConnection.scopes,
      connected_by: data.connected_by,
      last_sync_at: data.last_sync_at,
      sync_cursor_modified_on: data.sync_cursor_modified_on,
      source: 'database',
    }
  }

  const now = new Date().toISOString()
  const { data: created } = await serviceClient
    .from('sapo_connections')
    .insert({
      store: envConnection.store,
      access_token: '__env__',
      scopes: envConnection.scopes,
      connected_by: null,
      created_at: now,
      updated_at: now,
    })
    .select('id, store, scopes, connected_by, last_sync_at, sync_cursor_modified_on')
    .single()

  if (!created) return envConnection

  return {
    ...envConnection,
    id: created.id,
    scopes: created.scopes || envConnection.scopes,
    connected_by: created.connected_by,
    last_sync_at: created.last_sync_at,
    sync_cursor_modified_on: created.sync_cursor_modified_on,
    source: 'database',
  }
}

function isCronAuthorized(request: NextRequest): boolean {
  const secret = process.env.CRON_SECRET
  if (request.headers.get('x-vercel-cron') === '1') return true
  if (!secret) return true
  const auth = request.headers.get('authorization')
  const querySecret = new URL(request.url).searchParams.get('secret')
  return auth === `Bearer ${secret}` || querySecret === secret
}
