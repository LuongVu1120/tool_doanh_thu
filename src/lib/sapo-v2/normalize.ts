/**
 * Chuẩn hoá dữ liệu raw từ Sapo API → row sẵn sàng để upsert vào DB.
 */
import type {
  SapoApiOrder,
  SapoApiUser,
  SapoChannelRow,
  SapoMemberRow,
  SapoOrderRow,
  SapoPlatform,
} from './types'

const PREFIX_REGEX = /^([A-ZĐa-zđ]{1,6}[0-9]?)\s+/

export function normalizeSapoUser(raw: SapoApiUser, now = new Date().toISOString()): SapoMemberRow {
  const first = (raw.first_name || '').trim() || null
  const last = (raw.last_name || '').trim() || null
  const full = [first, last].filter(Boolean).join(' ').trim() || null
  let prefix: string | null = null
  if (full) {
    const m = full.match(PREFIX_REGEX)
    if (m) prefix = m[1].toUpperCase()
  }
  return {
    sapo_user_id: raw.id,
    email: raw.email || null,
    first_name: first,
    last_name: last,
    full_name: full,
    phone_number: raw.phone_number || null,
    prefix_code: prefix,
    is_active: true,
    last_synced_at: now,
    raw,
  }
}

const PLATFORM_FROM_ALIAS: Record<string, SapoPlatform> = {
  facebook: 'facebook',
  'tiktok-for-business': 'tiktok',
  tiktokshop: 'tiktok',
  zalo: 'zalo',
  'zalo-oa': 'zalo',
  pos: 'pos',
  web: 'web',
  shopee: 'shopee',
  youtube: 'youtube',
}

function inferPlatform(aliasOrSource: string | null | undefined): SapoPlatform {
  if (!aliasOrSource) return 'other'
  const key = String(aliasOrSource).toLowerCase()
  if (PLATFORM_FROM_ALIAS[key]) return PLATFORM_FROM_ALIAS[key]
  if (key.includes('facebook') || key.includes('fb')) return 'facebook'
  if (key.includes('tiktok')) return 'tiktok'
  if (key.includes('zalo')) return 'zalo'
  if (key.includes('pos')) return 'pos'
  if (key.includes('shopee')) return 'shopee'
  if (key.includes('youtube') || key.includes('yt')) return 'youtube'
  if (key.includes('web')) return 'web'
  return 'other'
}

/**
 * Trích xuất kênh từ 1 đơn. Trả về row sẵn sàng upsert vào `sapo_channels`,
 * và 1 `channelKey` ổn định để khớp với order khi resolve channel_id.
 *
 * channelKey = `${alias}::${branch_external_id || branch_name || 'default'}`
 */
export function extractChannelFromOrder(order: SapoApiOrder): { row: SapoChannelRow; key: string } | null {
  const cd = order.channel_definition
  const aliasFromCd = cd?.alias?.toString().toLowerCase().trim() || null
  const aliasFromSource = order.source_name?.toString().toLowerCase().trim() || null
  const alias = aliasFromCd || aliasFromSource
  if (!alias) return null

  const branchExternalId = cd?.branch_external_id?.toString().trim() || null
  const branchName = cd?.branch_name?.toString().trim() || null
  const platform = inferPlatform(aliasFromCd || aliasFromSource)
  const appAlias = order.app?.alias?.toString() || null

  const key = `${alias}::${branchExternalId || branchName || 'default'}`
  return {
    key,
    row: {
      alias,
      main_name: cd?.main_name || null,
      sub_name: cd?.sub_name || null,
      branch_name: branchName,
      branch_external_id: branchExternalId,
      platform,
      app_alias: appAlias,
    },
  }
}

export function normalizeSapoOrder(order: SapoApiOrder, store: string): SapoOrderRow {
  const orderNumber = order.name ? String(order.name).trim() : String(order.id)
  const channel = extractChannelFromOrder(order)
  const platform = channel ? channel.row.platform : inferPlatform(order.source_name as string | null)

  const landing = order.landing_site || null
  const utm = landing ? parseUtm(landing) : { campaign: null, source: null, medium: null }

  return {
    sapo_order_id: Number(order.id),
    order_number: orderNumber,
    store,
    creator_member_id: order.user_id ? Number(order.user_id) : null,
    assignee_member_id: order.assignee_id ? Number(order.assignee_id) : null,
    channel_key: channel?.key ?? null,
    sapo_location_id: order.location_id ? Number(order.location_id) : null,
    platform: platform,
    status: order.status || null,
    financial_status: order.financial_status || null,
    fulfillment_status: order.fulfillment_status || null,
    total_price: toBigint(order.total_price),
    total_received: toBigint(order.total_received),
    total_refunded: toBigint(order.total_refunded),
    currency: order.currency || 'VND',
    created_on: order.created_on || null,
    modified_on: order.modified_on || null,
    processed_on: order.processed_on || null,
    cancelled_on: order.cancelled_on || null,
    paid_on: order.paid_on || null,
    source_name: order.source_name || null,
    landing_site: landing,
    utm_campaign: utm.campaign,
    utm_source: utm.source,
    utm_medium: utm.medium,
    tags: normalizeTagString(order.tags),
    raw: order,
  }
}

function parseUtm(url: string): { campaign: string | null; source: string | null; medium: string | null } {
  try {
    const u = new URL(url)
    return {
      campaign: u.searchParams.get('utm_campaign'),
      source: u.searchParams.get('utm_source'),
      medium: u.searchParams.get('utm_medium'),
    }
  } catch {
    return { campaign: null, source: null, medium: null }
  }
}

function toBigint(value: unknown): number {
  if (value === null || value === undefined) return 0
  const n = Number(value)
  if (Number.isNaN(n)) return 0
  return Math.round(n)
}

function normalizeTagString(tags: SapoApiOrder['tags']): string | null {
  if (!tags) return null
  if (Array.isArray(tags)) return tags.filter(Boolean).join(', ')
  return String(tags)
}
