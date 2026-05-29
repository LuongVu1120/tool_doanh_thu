export const dynamic = 'force-dynamic'

import { NextRequest, NextResponse } from 'next/server'
import { createClient, createServiceClient } from '@/lib/supabase/server'
import { getEnvSapoConnection } from '@/lib/sapo-api/client'

export async function GET(request: NextRequest) {
  const supabase = await createClient()
  const { data: { user }, error } = await supabase.auth.getUser()
  if (error || !user) {
    return NextResponse.json({ error: 'Chưa đăng nhập' }, { status: 401 })
  }

  const appUrl = process.env.NEXT_PUBLIC_APP_URL || new URL(request.url).origin
  const token = process.env.SAPO_WEBHOOK_SECRET ? '?token=<SAPO_WEBHOOK_SECRET>' : ''
  const webhook = {
    url: `${appUrl.replace(/\/$/, '')}/api/sapo/webhooks/orders${token}`,
    topics: ['orders/create', 'orders/updated', 'orders/paid', 'orders/cancelled', 'refunds/create'],
  }
  const envConnection = getEnvSapoConnection()

  if (envConnection) {
    const serviceClient = await createServiceClient()
    const { data: savedConnection } = await serviceClient
      .from('sapo_connections')
      .select('id, store, scopes, connected_by, last_sync_at, sync_cursor_modified_on, created_at, updated_at')
      .eq('store', envConnection.store)
      .maybeSingle()

    const usingBasicAuth = Boolean(envConnection.api_key && envConnection.api_secret)

    return NextResponse.json({
      connections: [{
        id: savedConnection?.id || envConnection.id,
        store: envConnection.store,
        scopes: savedConnection?.scopes || envConnection.scopes,
        connected_by: savedConnection?.connected_by || null,
        last_sync_at: savedConnection?.last_sync_at || null,
        sync_cursor_modified_on: savedConnection?.sync_cursor_modified_on || null,
        created_at: savedConnection?.created_at || null,
        updated_at: savedConnection?.updated_at || null,
        source: 'env',
      }],
      mode: usingBasicAuth ? 'private_app' : 'private_token',
      migrationRequired: false,
      configured: getConfigStatus(),
      webhook,
    })
  }

  const serviceClient = await createServiceClient()
  const { data: connections, error: connectionsError } = await serviceClient
    .from('sapo_connections')
    .select('id, store, scopes, connected_by, last_sync_at, sync_cursor_modified_on, created_at, updated_at')
    .order('created_at', { ascending: false })

  if (connectionsError?.code === 'PGRST205' || connectionsError?.message.includes('sapo_connections')) {
    return NextResponse.json({
      connections: [],
      migrationRequired: true,
      error: 'Chưa chạy migration supabase/migrations/008_sapo_realtime.sql',
      configured: getConfigStatus(),
      webhook,
    })
  }

  if (connectionsError) {
    return NextResponse.json({ error: connectionsError.message }, { status: 500 })
  }

  return NextResponse.json({
    connections: connections || [],
    mode: 'oauth',
    migrationRequired: false,
    configured: getConfigStatus(),
    webhook,
  })
}

function getConfigStatus() {
  return {
    clientId: Boolean(process.env.SAPO_CLIENT_ID),
    clientSecret: Boolean(process.env.SAPO_CLIENT_SECRET),
    store: Boolean(process.env.SAPO_STORE),
    accessToken: Boolean(process.env.SAPO_ACCESS_TOKEN),
    apiKey: Boolean(process.env.SAPO_API_KEY),
    apiSecret: Boolean(process.env.SAPO_API_SECRET),
    webhookSecret: Boolean(process.env.SAPO_WEBHOOK_SECRET),
    cronSecret: Boolean(process.env.CRON_SECRET),
  }
}
