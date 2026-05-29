export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export interface Database {
  public: {
    Tables: {
      users: {
        Row: {
          id: string
          email: string
          full_name: string | null
          avatar_url: string | null
          role: 'admin' | 'media' | 'viewer'
          created_at: string
          updated_at: string
        }
        Insert: {
          id: string
          email: string
          full_name?: string | null
          avatar_url?: string | null
          role?: 'admin' | 'media' | 'viewer'
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          email?: string
          full_name?: string | null
          avatar_url?: string | null
          role?: 'admin' | 'media' | 'viewer'
          updated_at?: string
        }
      }
      mapping_imports: {
        Row: {
          id: string
          uploaded_by: string | null
          file_name: string | null
          total_rows: number
          total_employees: number
          total_channels: number
          unassigned_count: number
          active_from: string
          active_to: string | null
          notes: string | null
          created_at: string
        }
        Insert: {
          id?: string
          uploaded_by?: string | null
          file_name?: string | null
          total_rows?: number
          total_employees?: number
          total_channels?: number
          unassigned_count?: number
          active_from?: string
          active_to?: string | null
          notes?: string | null
          created_at?: string
        }
        Update: {
          active_to?: string | null
          notes?: string | null
          total_rows?: number
          total_employees?: number
          total_channels?: number
          unassigned_count?: number
        }
      }
      channel_tags: {
        Row: {
          id: number
          mapping_import_id: string
          tag_name_normalized: string
          tag_name_original: string
          channel_display: string | null
          employee_name: string | null
          employee_id: string | null
          created_at: string
        }
        Insert: {
          id?: number
          mapping_import_id: string
          tag_name_normalized: string
          tag_name_original: string
          channel_display?: string | null
          employee_name?: string | null
          employee_id?: string | null
          created_at?: string
        }
        Update: {
          channel_display?: string | null
          employee_name?: string | null
          employee_id?: string | null
        }
      }
      orders: {
        Row: {
          order_code: string
          source: string | null
          status: string | null
          channel_tag_matched: string | null
          employee_name: string | null
          employee_id: string | null
          completion_date: string | null
          order_date: string | null
          total_amount: number
          original_amount: number | null
          recognized_amount: number | null
          exchange_type: 'none' | 'no_extra' | 'with_extra' | 'needs_review'
          review_status: 'none' | 'pending' | 'included' | 'excluded'
          review_resolution: Json | null
          raw_tags: string | null
          notes: string | null
          is_returned: boolean
          return_code: string | null
          return_amount: number | null
          return_date: string | null
          first_imported_at: string
          last_updated_at: string
          period_locked: boolean
          sapo_order_id: string | null
          sapo_financial_status: string | null
          sapo_fulfillment_status: string | null
          sapo_status: string | null
          sapo_modified_on: string | null
          sapo_raw: Json | null
        }
        Insert: {
          order_code: string
          source?: string | null
          status?: string | null
          channel_tag_matched?: string | null
          employee_name?: string | null
          employee_id?: string | null
          completion_date?: string | null
          order_date?: string | null
          total_amount?: number
          original_amount?: number | null
          recognized_amount?: number | null
          exchange_type?: 'none' | 'no_extra' | 'with_extra' | 'needs_review'
          review_status?: 'none' | 'pending' | 'included' | 'excluded'
          review_resolution?: Json | null
          raw_tags?: string | null
          notes?: string | null
          is_returned?: boolean
          return_code?: string | null
          return_amount?: number | null
          return_date?: string | null
          first_imported_at?: string
          last_updated_at?: string
          period_locked?: boolean
          sapo_order_id?: string | null
          sapo_financial_status?: string | null
          sapo_fulfillment_status?: string | null
          sapo_status?: string | null
          sapo_modified_on?: string | null
          sapo_raw?: Json | null
        }
        Update: {
          source?: string | null
          status?: string | null
          channel_tag_matched?: string | null
          employee_name?: string | null
          employee_id?: string | null
          completion_date?: string | null
          order_date?: string | null
          total_amount?: number
          original_amount?: number | null
          recognized_amount?: number | null
          exchange_type?: 'none' | 'no_extra' | 'with_extra' | 'needs_review'
          review_status?: 'none' | 'pending' | 'included' | 'excluded'
          review_resolution?: Json | null
          raw_tags?: string | null
          notes?: string | null
          is_returned?: boolean
          return_code?: string | null
          return_amount?: number | null
          return_date?: string | null
          last_updated_at?: string
          period_locked?: boolean
          sapo_order_id?: string | null
          sapo_financial_status?: string | null
          sapo_fulfillment_status?: string | null
          sapo_status?: string | null
          sapo_modified_on?: string | null
          sapo_raw?: Json | null
        }
      }
      revenue_imports: {
        Row: {
          id: string
          uploaded_by: string | null
          file_name: string | null
          file_type: 'orders' | 'mapping' | 'returns' | null
          total_rows_in_file: number
          total_orders_processed: number
          orders_upserted: number
          orders_new: number
          orders_status_changed: number
          status: 'processing' | 'done' | 'error'
          error_message: string | null
          created_at: string
        }
        Insert: {
          id?: string
          uploaded_by?: string | null
          file_name?: string | null
          file_type?: 'orders' | 'mapping' | 'returns' | null
          total_rows_in_file?: number
          total_orders_processed?: number
          orders_upserted?: number
          orders_new?: number
          orders_status_changed?: number
          status?: 'processing' | 'done' | 'error'
          error_message?: string | null
          created_at?: string
        }
        Update: {
          status?: 'processing' | 'done' | 'error'
          error_message?: string | null
          total_rows_in_file?: number
          total_orders_processed?: number
          orders_upserted?: number
          orders_new?: number
          orders_status_changed?: number
        }
      }
      sapo_connections: {
        Row: {
          id: string
          store: string
          access_token: string
          scopes: string | null
          connected_by: string | null
          last_sync_at: string | null
          sync_cursor_modified_on: string | null
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          store: string
          access_token: string
          scopes?: string | null
          connected_by?: string | null
          last_sync_at?: string | null
          sync_cursor_modified_on?: string | null
          created_at?: string
          updated_at?: string
        }
        Update: {
          access_token?: string
          scopes?: string | null
          connected_by?: string | null
          last_sync_at?: string | null
          sync_cursor_modified_on?: string | null
          updated_at?: string
        }
      }
      revenue_adjustments: {
        Row: {
          id: string
          period: string
          employee_name: string
          channel_group: string
          channel_name: string
          amount: number
          reason: string | null
          source_label: string | null
          created_by: string | null
          created_at: string
        }
        Insert: {
          id?: string
          period: string
          employee_name: string
          channel_group: string
          channel_name: string
          amount?: number
          reason?: string | null
          source_label?: string | null
          created_by?: string | null
          created_at?: string
        }
        Update: {
          period?: string
          employee_name?: string
          channel_group?: string
          channel_name?: string
          amount?: number
          reason?: string | null
          source_label?: string | null
        }
      }
      return_imports: {
        Row: {
          id: string
          uploaded_by: string | null
          file_name: string | null
          total_returns: number
          matched_count: number
          unmatched_count: number
          created_at: string
        }
        Insert: {
          id?: string
          uploaded_by?: string | null
          file_name?: string | null
          total_returns?: number
          matched_count?: number
          unmatched_count?: number
          created_at?: string
        }
        Update: {
          matched_count?: number
          unmatched_count?: number
        }
      }
      returns: {
        Row: {
          return_code: string
          return_import_id: string | null
          original_order_code: string | null
          return_amount: number
          return_reason: string | null
          return_date: string | null
          matched: boolean
          created_at: string
        }
        Insert: {
          return_code: string
          return_import_id?: string | null
          original_order_code?: string | null
          return_amount?: number
          return_reason?: string | null
          return_date?: string | null
          matched?: boolean
          created_at?: string
        }
        Update: {
          matched?: boolean
          return_amount?: number
          return_reason?: string | null
          return_date?: string | null
        }
      }
      kpi_targets: {
        Row: {
          id: number
          employee_id: string
          period: string
          target_amount: number
          created_by: string | null
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: number
          employee_id: string
          period: string
          target_amount?: number
          created_by?: string | null
          created_at?: string
          updated_at?: string
        }
        Update: {
          target_amount?: number
          updated_at?: string
        }
      }
      period_locks: {
        Row: {
          period: string
          locked_by: string | null
          locked_at: string
          notes: string | null
        }
        Insert: {
          period: string
          locked_by?: string | null
          locked_at?: string
          notes?: string | null
        }
        Update: {
          locked_by?: string | null
          locked_at?: string
          notes?: string | null
        }
      }
      chat_sessions: {
        Row: {
          id: string
          user_id: string
          title: string | null
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          user_id: string
          title?: string | null
          created_at?: string
          updated_at?: string
        }
        Update: {
          title?: string | null
          updated_at?: string
        }
      }
      chat_messages: {
        Row: {
          id: string
          session_id: string
          role: 'user' | 'assistant'
          content: string
          tokens_used: number | null
          created_at: string
        }
        Insert: {
          id?: string
          session_id: string
          role: 'user' | 'assistant'
          content: string
          tokens_used?: number | null
          created_at?: string
        }
        Update: Record<string, never>
      }
      sapo_members: {
        Row: {
          sapo_user_id: number
          email: string | null
          first_name: string | null
          last_name: string | null
          full_name: string | null
          phone_number: string | null
          prefix_code: string | null
          is_media_team: boolean
          is_active: boolean
          last_synced_at: string
          raw: Json | null
          created_at: string
          updated_at: string
        }
        Insert: {
          sapo_user_id: number
          email?: string | null
          first_name?: string | null
          last_name?: string | null
          full_name?: string | null
          phone_number?: string | null
          prefix_code?: string | null
          is_media_team?: boolean
          is_active?: boolean
          last_synced_at?: string
          raw?: Json | null
          created_at?: string
          updated_at?: string
        }
        Update: {
          email?: string | null
          first_name?: string | null
          last_name?: string | null
          full_name?: string | null
          phone_number?: string | null
          prefix_code?: string | null
          is_media_team?: boolean
          is_active?: boolean
          last_synced_at?: string
          raw?: Json | null
          updated_at?: string
        }
      }
      sapo_channels: {
        Row: {
          id: string
          alias: string
          main_name: string | null
          sub_name: string | null
          branch_name: string | null
          branch_external_id: string | null
          platform: string
          app_alias: string | null
          media_member_id: number | null
          is_active: boolean
          first_seen_at: string
          last_seen_at: string
          orders_count: number
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          alias: string
          main_name?: string | null
          sub_name?: string | null
          branch_name?: string | null
          branch_external_id?: string | null
          platform: string
          app_alias?: string | null
          media_member_id?: number | null
          is_active?: boolean
          first_seen_at?: string
          last_seen_at?: string
          orders_count?: number
          created_at?: string
          updated_at?: string
        }
        Update: {
          alias?: string
          main_name?: string | null
          sub_name?: string | null
          branch_name?: string | null
          branch_external_id?: string | null
          platform?: string
          app_alias?: string | null
          media_member_id?: number | null
          is_active?: boolean
          last_seen_at?: string
          orders_count?: number
          updated_at?: string
        }
      }
      sapo_orders: {
        Row: {
          sapo_order_id: number
          order_number: string
          store: string
          creator_member_id: number | null
          assignee_member_id: number | null
          channel_id: string | null
          sapo_location_id: number | null
          platform: string | null
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
          raw: Json | null
          first_synced_at: string
          last_synced_at: string
        }
        Insert: {
          sapo_order_id: number
          order_number: string
          store: string
          creator_member_id?: number | null
          assignee_member_id?: number | null
          channel_id?: string | null
          sapo_location_id?: number | null
          platform?: string | null
          status?: string | null
          financial_status?: string | null
          fulfillment_status?: string | null
          total_price?: number
          total_received?: number
          total_refunded?: number
          currency?: string
          created_on?: string | null
          modified_on?: string | null
          processed_on?: string | null
          cancelled_on?: string | null
          paid_on?: string | null
          source_name?: string | null
          landing_site?: string | null
          utm_campaign?: string | null
          utm_source?: string | null
          utm_medium?: string | null
          tags?: string | null
          raw?: Json | null
          first_synced_at?: string
          last_synced_at?: string
        }
        Update: {
          order_number?: string
          creator_member_id?: number | null
          assignee_member_id?: number | null
          channel_id?: string | null
          sapo_location_id?: number | null
          platform?: string | null
          status?: string | null
          financial_status?: string | null
          fulfillment_status?: string | null
          total_price?: number
          total_received?: number
          total_refunded?: number
          currency?: string
          created_on?: string | null
          modified_on?: string | null
          processed_on?: string | null
          cancelled_on?: string | null
          paid_on?: string | null
          source_name?: string | null
          landing_site?: string | null
          utm_campaign?: string | null
          utm_source?: string | null
          utm_medium?: string | null
          tags?: string | null
          raw?: Json | null
          last_synced_at?: string
        }
      }
      sapo_sync_state: {
        Row: {
          store: string
          members_last_sync_at: string | null
          orders_last_sync_at: string | null
          orders_cursor_modified_on: string | null
          total_orders_synced: number
          total_members_synced: number
          total_channels_discovered: number
          last_error: string | null
          updated_at: string
        }
        Insert: {
          store: string
          members_last_sync_at?: string | null
          orders_last_sync_at?: string | null
          orders_cursor_modified_on?: string | null
          total_orders_synced?: number
          total_members_synced?: number
          total_channels_discovered?: number
          last_error?: string | null
          updated_at?: string
        }
        Update: {
          members_last_sync_at?: string | null
          orders_last_sync_at?: string | null
          orders_cursor_modified_on?: string | null
          total_orders_synced?: number
          total_members_synced?: number
          total_channels_discovered?: number
          last_error?: string | null
          updated_at?: string
        }
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      rpc_suggest_channel_owners: {
        Args: {
          p_member_ids: number[]
          p_min_orders?: number
        }
        Returns: Array<{
          channel_id: string
          channel_alias: string
          channel_branch_name: string | null
          platform: string | null
          suggested_member_id: number
          suggested_member_name: string
          suggested_member_prefix: string | null
          orders_count: number
          total_orders: number
          share_pct: number
        }>
      }
      rpc_channel_owner_context: {
        Args: {
          p_media_ids: number[]
        }
        Returns: Array<{
          channel_id: string
          channel_alias: string
          channel_branch_name: string | null
          platform: string | null
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
        }>
      }
    }
    Enums: {
      [_ in never]: never
    }
  }
}

// Convenience types
export type UserRow = Database['public']['Tables']['users']['Row']
export type MappingImportRow = Database['public']['Tables']['mapping_imports']['Row']
export type ChannelTagRow = Database['public']['Tables']['channel_tags']['Row']
export type OrderRow = Database['public']['Tables']['orders']['Row']
export type RevenueImportRow = Database['public']['Tables']['revenue_imports']['Row']
export type SapoConnectionRow = Database['public']['Tables']['sapo_connections']['Row']
export type RevenueAdjustmentRow = Database['public']['Tables']['revenue_adjustments']['Row']
export type ReturnImportRow = Database['public']['Tables']['return_imports']['Row']
export type ReturnRow = Database['public']['Tables']['returns']['Row']
export type KpiTargetRow = Database['public']['Tables']['kpi_targets']['Row']
export type PeriodLockRow = Database['public']['Tables']['period_locks']['Row']
export type ChatSessionRow = Database['public']['Tables']['chat_sessions']['Row']
export type ChatMessageRow = Database['public']['Tables']['chat_messages']['Row']
export type SapoMemberRow = Database['public']['Tables']['sapo_members']['Row']
export type SapoChannelRow = Database['public']['Tables']['sapo_channels']['Row']
export type SapoOrderRow = Database['public']['Tables']['sapo_orders']['Row']
export type SapoSyncStateRow = Database['public']['Tables']['sapo_sync_state']['Row']
