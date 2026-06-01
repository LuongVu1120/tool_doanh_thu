export interface ChannelView {
  id: string
  alias: string
  platform: string
  branch_name: string | null
  branch_external_id: string | null
  main_name: string | null
  sub_name: string | null
  app_alias: string | null
  media_member_id: number | null
  orders_count: number
  last_seen_at: string
}

export interface ChannelContext {
  channel_id: string
  total_orders: number
  top_creator_id: number | null
  top_creator_name: string | null
  top_creator_prefix: string | null
  top_creator_orders: number | null
  top_creator_is_media: boolean
  top_media_creator_id: number | null
  top_media_creator_name: string | null
  top_media_creator_prefix: string | null
  top_media_creator_orders: number | null
  top_assignee_id: number | null
  top_assignee_name: string | null
  top_assignee_prefix: string | null
  top_assignee_orders: number | null
  top_assignee_is_media: boolean
}

export interface MemberView {
  sapo_user_id: number
  full_name: string | null
  email: string | null
  prefix_code: string | null
  is_media_team: boolean
  is_active: boolean
}

export interface DashboardData {
  range: { from: string; to: string }
  sync?: {
    last_sync_at: string | null
    cursor_modified_on: string | null
    total_orders_synced: number
    total_channels_discovered: number
    last_error: string | null
  }
  summary: {
    total_orders: number
    revenue_total: number
    revenue_paid: number
    revenue_received: number
    revenue_refunded: number
    cancelled_count: number
    traffic_orders: number
    traffic_cancelled_count: number
    traffic_revenue_paid: number
    traffic_revenue_gross: number
    traffic_revenue_received: number
    traffic_revenue_refunded: number
    excluded_unassigned_orders: number
  }
  byPlatform: Array<{ platform: string; orders: number; revenue: number; paid: number }>
  byChannel: Array<{
    channel_id: string
    channel_name: string
    platform: string | null
    orders: number
    revenue: number
    paid: number
    media_member_id: number | null
    media_member_name: string | null
  }>
  byMediaMember: Array<{
    sapo_user_id: number
    name: string
    prefix: string | null
    orders: number
    revenue: number
    paid: number
    channels: number
  }>
  byCreator: Array<{
    sapo_user_id: number
    name: string
    prefix: string | null
    orders: number
    revenue: number
    paid: number
  }>
  byMonth: Array<{
    month: string
    orders: number
    cancelled: number
    revenue: number
    paid: number
    received: number
    refunded: number
    by_platform: Record<string, { orders: number; revenue: number }>
  }>
}

export interface SapoConnectionView {
  id: string
  store: string
  scopes: string | null
  last_sync_at: string | null
  sync_cursor_modified_on: string | null
  created_at: string | null
  source?: 'env' | 'database'
}

export interface SapoStatus {
  connections: SapoConnectionView[]
  migrationRequired?: boolean
  error?: string
  mode?: 'private_token' | 'private_app' | 'oauth'
  configured: {
    clientId: boolean
    clientSecret: boolean
    store: boolean
    accessToken: boolean
    apiKey: boolean
    apiSecret: boolean
    webhookSecret: boolean
    cronSecret: boolean
  }
  webhook: {
    url: string
    topics: string[]
  }
}
