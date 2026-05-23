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
          raw_tags: string | null
          notes: string | null
          is_returned: boolean
          return_code: string | null
          return_amount: number | null
          return_date: string | null
          first_imported_at: string
          last_updated_at: string
          period_locked: boolean
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
          raw_tags?: string | null
          notes?: string | null
          is_returned?: boolean
          return_code?: string | null
          return_amount?: number | null
          return_date?: string | null
          first_imported_at?: string
          last_updated_at?: string
          period_locked?: boolean
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
          raw_tags?: string | null
          notes?: string | null
          is_returned?: boolean
          return_code?: string | null
          return_amount?: number | null
          return_date?: string | null
          last_updated_at?: string
          period_locked?: boolean
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
          orders_upserted?: number
          orders_new?: number
          orders_status_changed?: number
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
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      [_ in never]: never
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
export type ReturnImportRow = Database['public']['Tables']['return_imports']['Row']
export type ReturnRow = Database['public']['Tables']['returns']['Row']
export type KpiTargetRow = Database['public']['Tables']['kpi_targets']['Row']
export type PeriodLockRow = Database['public']['Tables']['period_locks']['Row']
export type ChatSessionRow = Database['public']['Tables']['chat_sessions']['Row']
export type ChatMessageRow = Database['public']['Tables']['chat_messages']['Row']
