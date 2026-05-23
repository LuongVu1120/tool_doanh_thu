import type { Database } from '@/types/database'
import { createClient as _createRawClient } from '@supabase/supabase-js'

/**
 * Adds the required `Relationships: []` field to each table so the type
 * satisfies @supabase/supabase-js's GenericTable constraint.
 *
 * The @supabase/ssr package imports GenericSchema from a path that no longer
 * exists in newer supabase-js versions, so createServerClient/createBrowserClient
 * can't infer row types. We work around this by casting the client to the
 * properly-typed SupabaseClient from the core package.
 */
type AddRelationships<T> = T extends { Row: infer R; Insert: infer I; Update: infer U }
  ? { Row: R; Insert: I; Update: U; Relationships: [] }
  : T

type FixTables<Tables> = {
  [K in keyof Tables]: AddRelationships<Tables[K]>
}

export type FixedDatabase = {
  public: {
    Tables: FixTables<Database['public']['Tables']>
    Views: Database['public']['Views']
    Functions: Database['public']['Functions']
  }
}

/** The correctly-typed Supabase client */
export type TypedSupabaseClient = ReturnType<typeof _createRawClient<FixedDatabase>>
