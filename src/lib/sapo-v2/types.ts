/**
 * Types cho Sapo first-class data model (migration 009).
 * Phân biệt với `src/lib/sapo-api/types.ts` cũ (dùng cho Excel-based pipeline).
 */

// ===== Sapo raw API shapes =====

export interface SapoApiUser {
  id: number
  email?: string | null
  first_name?: string | null
  last_name?: string | null
  phone_number?: string | null
  url?: string | null
  description?: string | null
  last_login?: string | null
  [key: string]: unknown
}

export interface SapoApiUsersResponse {
  users?: SapoApiUser[]
}

export interface SapoApiChannelDefinition {
  id?: number | null
  main_name?: string | null
  sub_name?: string | null
  alias?: string | null
  branch_name?: string | null
  branch_external_id?: string | null
}

export interface SapoApiOrder {
  id: number
  name?: string | null
  total_price?: number | string | null
  total_received?: number | string | null
  total_refunded?: number | string | null
  currency?: string | null

  status?: string | null
  financial_status?: string | null
  fulfillment_status?: string | null

  created_on?: string | null
  modified_on?: string | null
  processed_on?: string | null
  cancelled_on?: string | null
  paid_on?: string | null

  user_id?: number | null
  assignee_id?: number | null
  location_id?: number | null
  source_name?: string | null
  landing_site?: string | null
  tags?: string | string[] | null

  channel_definition?: SapoApiChannelDefinition | null
  app?: { alias?: string | null; id?: number | null; key?: string | null } | null

  [key: string]: unknown
}

export interface SapoApiOrdersResponse {
  orders?: SapoApiOrder[]
}

// ===== Domain shapes (đã chuẩn hoá để upsert vào DB) =====

export interface SapoMemberRow {
  sapo_user_id: number
  email: string | null
  first_name: string | null
  last_name: string | null
  full_name: string | null
  phone_number: string | null
  prefix_code: string | null
  is_active: boolean
  last_synced_at: string
  raw: SapoApiUser
}

export interface SapoChannelRow {
  alias: string
  main_name: string | null
  sub_name: string | null
  branch_name: string | null
  branch_external_id: string | null
  platform: SapoPlatform
  app_alias: string | null
}

export type SapoPlatform =
  | 'facebook'
  | 'tiktok'
  | 'zalo'
  | 'pos'
  | 'web'
  | 'shopee'
  | 'youtube'
  | 'other'

export interface SapoOrderRow {
  sapo_order_id: number
  order_number: string
  store: string
  creator_member_id: number | null
  assignee_member_id: number | null
  channel_key: string | null // tạm thời, sẽ thay bằng channel_id sau khi upsert channels xong
  sapo_location_id: number | null
  platform: SapoPlatform | null
  status: string | null
  financial_status: string | null
  fulfillment_status: string | null
  total_price: number
  total_received: number
  total_refunded: number
  currency: string
  created_on: string | null
  modified_on: string | null
  processed_on: string | null
  cancelled_on: string | null
  paid_on: string | null
  source_name: string | null
  landing_site: string | null
  utm_campaign: string | null
  utm_source: string | null
  utm_medium: string | null
  tags: string | null
  raw: SapoApiOrder
}

export interface SapoSyncStats {
  members_synced: number
  channels_discovered: number
  orders_fetched: number
  orders_upserted: number
  pages_fetched: number
  rate_limit_last: string | null
  cursor_modified_on: string | null
  elapsed_ms: number
}
