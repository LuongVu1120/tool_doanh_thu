export const dynamic = 'force-dynamic'
export const maxDuration = 60

import { createHmac, timingSafeEqual } from 'crypto'
import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/server'
import { getEnvSapoConnection } from '@/lib/sapo-api/client'
import { ingestSapoOrders } from '@/lib/sapo-api/sync'
import type { SapoConnection, SapoOrderResponse } from '@/lib/sapo-api/types'

export async function POST(request: NextRequest) {
  const rawBody = await request.text()
  if (!isWebhookAuthorized(request, rawBody)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  let payload: unknown
  try {
    payload = JSON.parse(rawBody)
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
  }

  const order = extractOrder(payload)
  if (!order) {
    return NextResponse.json({ ignored: true, reason: 'No order payload' })
  }

  const serviceClient = await createServiceClient()
  const store = getWebhookStore(request)
  const envConnection = getEnvSapoConnection()
  if (envConnection && (!store || store === envConnection.store)) {
    const result = await ingestSapoOrders(serviceClient, envConnection, [order])
    return NextResponse.json({ result, mode: 'private_token' })
  }

  let query = serviceClient
    .from('sapo_connections')
    .select('id, store, access_token, scopes, connected_by, last_sync_at, sync_cursor_modified_on')
    .order('created_at', { ascending: false })
    .limit(1)
  if (store) query = query.eq('store', store)

  const { data: connection, error } = await query.maybeSingle()
  if (error || !connection) {
    return NextResponse.json({ error: error?.message || 'No Sapo connection' }, { status: 404 })
  }

  const result = await ingestSapoOrders(serviceClient, connection as SapoConnection, [order])
  return NextResponse.json({ result })
}

function extractOrder(payload: unknown): SapoOrderResponse | null {
  if (!payload || typeof payload !== 'object') return null
  const record = payload as Record<string, unknown>
  if (record.order && typeof record.order === 'object') return record.order as SapoOrderResponse
  if (record.id || record.order_number || record.name || record.code) return record as SapoOrderResponse
  return null
}

function isWebhookAuthorized(request: NextRequest, rawBody: string): boolean {
  const secret = process.env.SAPO_WEBHOOK_SECRET
  if (!secret) return true

  const token = new URL(request.url).searchParams.get('token')
  if (token && token === secret) return true

  const signature =
    request.headers.get('x-sapo-hmac-sha256') ||
    request.headers.get('x-shopify-hmac-sha256')
  if (!signature) return false

  const digest = createHmac('sha256', secret).update(rawBody, 'utf8').digest('base64')
  return safeEqual(signature, digest)
}

function safeEqual(a: string, b: string): boolean {
  const left = Buffer.from(a)
  const right = Buffer.from(b)
  return left.length === right.length && timingSafeEqual(left, right)
}

function getWebhookStore(request: NextRequest): string | null {
  const urlStore = new URL(request.url).searchParams.get('store')
  if (urlStore) return urlStore
  const headerStore = request.headers.get('x-sapo-shop-domain') || request.headers.get('x-shopify-shop-domain')
  return headerStore?.replace(/\.mysapo\.net$/i, '') ?? null
}
