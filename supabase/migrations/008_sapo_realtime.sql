-- Sapo OAuth connection and order ingestion metadata.

CREATE TABLE IF NOT EXISTS public.sapo_connections (
  id                      UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  store                   TEXT NOT NULL UNIQUE,
  access_token            TEXT NOT NULL,
  scopes                  TEXT,
  connected_by            UUID REFERENCES public.users(id) ON DELETE SET NULL,
  last_sync_at            TIMESTAMPTZ,
  sync_cursor_modified_on TIMESTAMPTZ,
  created_at              TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at              TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_sapo_connections_store ON public.sapo_connections(store);

ALTER TABLE public.sapo_connections ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admin and media can view sapo connections" ON public.sapo_connections
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM public.users
      WHERE id = auth.uid() AND role IN ('admin', 'media')
    )
  );

CREATE POLICY "Service role can manage sapo connections" ON public.sapo_connections
  FOR ALL USING (auth.role() = 'service_role');

CREATE POLICY "Admin and media can manage sapo connections" ON public.sapo_connections
  FOR ALL USING (
    EXISTS (
      SELECT 1 FROM public.users
      WHERE id = auth.uid() AND role IN ('admin', 'media')
    )
  );

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'sapo_connections_updated_at') THEN
    CREATE TRIGGER sapo_connections_updated_at BEFORE UPDATE ON public.sapo_connections
      FOR EACH ROW EXECUTE PROCEDURE update_updated_at_column();
  END IF;
END $$;

ALTER TABLE public.orders
  ADD COLUMN IF NOT EXISTS sapo_order_id TEXT,
  ADD COLUMN IF NOT EXISTS sapo_financial_status TEXT,
  ADD COLUMN IF NOT EXISTS sapo_fulfillment_status TEXT,
  ADD COLUMN IF NOT EXISTS sapo_status TEXT,
  ADD COLUMN IF NOT EXISTS sapo_modified_on TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS sapo_raw JSONB;

CREATE INDEX IF NOT EXISTS idx_orders_sapo_order_id ON public.orders(sapo_order_id);
CREATE INDEX IF NOT EXISTS idx_orders_sapo_modified_on ON public.orders(sapo_modified_on);

DO $$
BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE public.orders;
EXCEPTION
  WHEN duplicate_object THEN NULL;
  WHEN undefined_object THEN NULL;
END $$;

SELECT 'Migration 008 complete: Sapo realtime tables and order metadata added.' AS result;
