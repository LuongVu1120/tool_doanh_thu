/**
 * Sapo Admin REST API client cho Sapo first-class pipeline.
 * Sử dụng cùng Basic Auth (Private App) đã verify trong `src/lib/sapo-api/client.ts`.
 */
import { buildSapoAuthHeaders, getStoreHost } from '@/lib/sapo-api/client'
import type {
  SapoApiOrdersResponse,
  SapoApiUsersResponse,
} from './types'

export interface SapoV2Auth {
  store: string
  apiKey?: string | null
  apiSecret?: string | null
  accessToken?: string | null
}

/**
 * Đọc cấu hình từ env. Ưu tiên Basic Auth (Private App).
 */
export function getEnvSapoV2Auth(): SapoV2Auth | null {
  const store = process.env.SAPO_STORE
  if (!store) return null

  const apiKey = process.env.SAPO_API_KEY
  const apiSecret = process.env.SAPO_API_SECRET
  if (apiKey && apiSecret) {
    return { store: normalizeStore(store), apiKey, apiSecret }
  }

  const accessToken = process.env.SAPO_ACCESS_TOKEN
  if (accessToken) {
    return { store: normalizeStore(store), accessToken }
  }
  return null
}

function normalizeStore(input: string): string {
  return input
    .trim()
    .replace(/^https?:\/\//i, '')
    .replace(/\/.*$/, '')
    .replace(/\.mysapo\.net$/i, '')
    .toLowerCase()
}

function buildHeaders(auth: SapoV2Auth): Record<string, string> {
  return buildSapoAuthHeaders({
    apiKey: auth.apiKey,
    apiSecret: auth.apiSecret,
    accessToken: auth.accessToken,
  })
}

async function fetchJson<T>(auth: SapoV2Auth, pathQs: string): Promise<{ status: number; ok: boolean; json: T | null; rateLimit: string | null }> {
  const url = `https://${getStoreHost(auth.store)}/admin${pathQs}`
  const res = await fetch(url, { headers: buildHeaders(auth) })
  const rateLimit = res.headers.get('x-sapo-api-call-limit')
  const text = await res.text()
  let json: T | null = null
  try { json = JSON.parse(text) as T } catch {}
  if (!res.ok) {
    const error = new Error(`Sapo API ${res.status} on ${pathQs}: ${text.slice(0, 200)}`)
    ;(error as Error & { status?: number }).status = res.status
    throw error
  }
  return { status: res.status, ok: res.ok, json, rateLimit }
}

/**
 * Lấy tất cả users của shop. Sapo không có pagination cứng cho users, mặc định trả max 250.
 * Đối với shop có nhiều hơn 250 users, vẫn nên paginate cho an toàn.
 */
export async function fetchAllSapoUsers(auth: SapoV2Auth): Promise<{ users: NonNullable<SapoApiUsersResponse['users']>; rateLimit: string | null }> {
  const all: NonNullable<SapoApiUsersResponse['users']> = []
  let page = 1
  let lastRateLimit: string | null = null
  while (page <= 50) {
    const { json, rateLimit } = await fetchJson<SapoApiUsersResponse>(auth, `/users.json?limit=250&page=${page}`)
    lastRateLimit = rateLimit
    const users = json?.users || []
    all.push(...users)
    if (users.length < 250) break
    page++
    await sleep(500)
  }
  return { users: all, rateLimit: lastRateLimit }
}

export interface FetchOrdersPageParams {
  auth: SapoV2Auth
  page: number
  limit?: number
  createdOnMin?: string | null
  createdOnMax?: string | null
  modifiedOnMin?: string | null
  modifiedOnMax?: string | null
  /**
   * `status` không hỗ trợ 'any' trên Sapo (khác Shopify). Để mặc định undefined = lấy tất cả.
   * @see https://docs.sapo.vn/docs/api/admin-rest/orders/order
   */
  status?: 'open' | 'closed' | 'cancelled'
}

export async function fetchSapoOrdersPage(params: FetchOrdersPageParams) {
  const { auth, page, limit = 250, createdOnMin, createdOnMax, modifiedOnMin, modifiedOnMax, status } = params
  const qs = new URLSearchParams()
  qs.set('page', String(page))
  qs.set('limit', String(limit))
  if (status) qs.set('status', status)
  if (createdOnMin) qs.set('created_on_min', createdOnMin)
  if (createdOnMax) qs.set('created_on_max', createdOnMax)
  if (modifiedOnMin) qs.set('modified_on_min', modifiedOnMin)
  if (modifiedOnMax) qs.set('modified_on_max', modifiedOnMax)
  return fetchJson<SapoApiOrdersResponse>(auth, `/orders.json?${qs.toString()}`)
}

export async function fetchSapoOrdersCount(params: {
  auth: SapoV2Auth
  createdOnMin?: string | null
  createdOnMax?: string | null
  modifiedOnMin?: string | null
  modifiedOnMax?: string | null
}) {
  const { auth, createdOnMin, createdOnMax, modifiedOnMin, modifiedOnMax } = params
  const qs = new URLSearchParams()
  if (createdOnMin) qs.set('created_on_min', createdOnMin)
  if (createdOnMax) qs.set('created_on_max', createdOnMax)
  if (modifiedOnMin) qs.set('modified_on_min', modifiedOnMin)
  if (modifiedOnMax) qs.set('modified_on_max', modifiedOnMax)
  const { json } = await fetchJson<{ count?: number }>(auth, `/orders/count.json?${qs.toString()}`)
  return json?.count ?? 0
}

export function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms))
}
