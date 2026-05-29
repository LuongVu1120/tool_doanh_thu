import type { SapoOrdersListResponse } from './types'
import type { SapoConnection } from './types'

export const SAPO_SCOPES = 'read_orders,write_orders'

export function normalizeStore(input: string): string {
  return input
    .trim()
    .replace(/^https?:\/\//i, '')
    .replace(/\/.*$/, '')
    .replace(/\.mysapo\.net$/i, '')
    .toLowerCase()
}

export function getStoreHost(store: string): string {
  return `${normalizeStore(store)}.mysapo.net`
}

export function getEnvSapoConnection(): SapoConnection | null {
  const store = process.env.SAPO_STORE
  if (!store) return null

  const apiKey = process.env.SAPO_API_KEY
  const apiSecret = process.env.SAPO_API_SECRET
  if (apiKey && apiSecret) {
    return {
      id: `env:${normalizeStore(store)}`,
      store: normalizeStore(store),
      access_token: '__basic_auth__',
      api_key: apiKey,
      api_secret: apiSecret,
      scopes: process.env.SAPO_SCOPES || 'read_orders',
      connected_by: null,
      last_sync_at: null,
      sync_cursor_modified_on: null,
      source: 'env',
    }
  }

  const accessToken = process.env.SAPO_ACCESS_TOKEN
  if (!accessToken) return null

  return {
    id: `env:${normalizeStore(store)}`,
    store: normalizeStore(store),
    access_token: accessToken,
    scopes: process.env.SAPO_SCOPES || 'read_orders',
    connected_by: null,
    last_sync_at: null,
    sync_cursor_modified_on: null,
    source: 'env',
  }
}

export function buildAuthorizeUrl(params: {
  store: string
  state: string
  redirectUri: string
}): string {
  const url = new URL(`https://${getStoreHost(params.store)}/admin/oauth/authorize`)
  url.searchParams.set('client_id', requireEnv('SAPO_CLIENT_ID'))
  url.searchParams.set('scope', process.env.SAPO_SCOPES || SAPO_SCOPES)
  url.searchParams.set('redirect_uri', params.redirectUri)
  url.searchParams.set('state', params.state)
  return url.toString()
}

export async function exchangeCodeForToken(params: {
  store: string
  code: string
  redirectUri: string
}): Promise<{ access_token: string; scope?: string }> {
  const response = await fetch(`https://${getStoreHost(params.store)}/admin/oauth/access_token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      client_id: requireEnv('SAPO_CLIENT_ID'),
      client_secret: requireEnv('SAPO_CLIENT_SECRET'),
      code: params.code,
      redirect_uri: params.redirectUri,
    }),
  })

  const json = await response.json().catch(() => null)
  if (!response.ok || !json?.access_token) {
    throw new Error(`Sapo token exchange failed: ${response.status} ${JSON.stringify(json)}`)
  }

  return json
}

export async function fetchSapoOrders(params: {
  store: string
  accessToken?: string
  apiKey?: string | null
  apiSecret?: string | null
  page: number
  limit?: number
  modifiedOnMin?: string | null
  /**
   * Filter theo trạng thái lifecycle của Sapo: 'open' | 'closed' | 'cancelled'.
   * Bỏ qua param này (mặc định) để lấy TẤT CẢ đơn. KHÔNG truyền 'any' vì
   * Sapo không hỗ trợ giá trị này (khác Shopify) và sẽ trả về 0 đơn.
   * Tham chiếu: https://docs.sapo.vn/docs/api/admin-rest/orders/order
   */
  status?: 'open' | 'closed' | 'cancelled'
}): Promise<SapoOrdersListResponse> {
  const url = new URL(`https://${getStoreHost(params.store)}/admin/orders.json`)
  if (params.status) url.searchParams.set('status', params.status)
  url.searchParams.set('page', String(params.page))
  url.searchParams.set('limit', String(params.limit ?? 250))
  if (params.modifiedOnMin) url.searchParams.set('modified_on_min', params.modifiedOnMin)

  const response = await fetch(url, {
    headers: buildSapoAuthHeaders({
      accessToken: params.accessToken,
      apiKey: params.apiKey,
      apiSecret: params.apiSecret,
    }),
  })

  const json = await response.json().catch(() => null)
  if (!response.ok) {
    throw new Error(`Sapo orders fetch failed: ${response.status} ${JSON.stringify(json)}`)
  }
  return json ?? {}
}

/**
 * Tạo headers xác thực cho Sapo Admin API.
 * - Ưu tiên Basic Auth khi có apiKey + apiSecret (Private App).
 * - Fallback X-Sapo-Access-Token khi có accessToken (OAuth Custom App).
 */
export function buildSapoAuthHeaders(params: {
  accessToken?: string | null
  apiKey?: string | null
  apiSecret?: string | null
}): Record<string, string> {
  const headers: Record<string, string> = { Accept: 'application/json' }
  if (params.apiKey && params.apiSecret) {
    headers['Authorization'] =
      'Basic ' + Buffer.from(`${params.apiKey}:${params.apiSecret}`).toString('base64')
    return headers
  }
  if (params.accessToken && params.accessToken !== '__basic_auth__') {
    headers['X-Sapo-Access-Token'] = params.accessToken
    return headers
  }
  throw new Error('Sapo: thiếu thông tin xác thực (apiKey/apiSecret hoặc accessToken)')
}

function requireEnv(name: string): string {
  const value = process.env[name]
  if (!value) throw new Error(`Missing ${name}`)
  return value
}
