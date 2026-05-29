import type { Json } from '@/types/database'

export interface SapoOrderResponse {
  id?: string | number
  code?: string | null
  order_code?: string | null
  name?: string | null
  order_number?: string | number | null
  source_name?: string | null
  landing_site_ref?: string | null
  gateway?: string | null
  status?: string | null
  financial_status?: string | null
  fulfillment_status?: string | null
  total_price?: string | number | null
  tags?: string | string[] | null
  note?: string | null
  created_on?: string | null
  processed_on?: string | null
  modified_on?: string | null
  updated_on?: string | null
  cancelled_on?: string | null
  closed_on?: string | null
  [key: string]: Json | undefined
}

export interface SapoOrdersListResponse {
  orders?: SapoOrderResponse[]
}

export interface SapoConnection {
  id: string
  store: string
  access_token: string
  /** Sapo Private App API Key. Khi có giá trị, dùng Basic Auth thay cho X-Sapo-Access-Token. */
  api_key?: string | null
  /** Sapo Private App API Secret, dùng kèm api_key. */
  api_secret?: string | null
  scopes: string | null
  connected_by: string | null
  last_sync_at: string | null
  sync_cursor_modified_on: string | null
  source?: 'database' | 'env'
}
