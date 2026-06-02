-- Alias/reconciliation layer for mapping accounting Excel channel names to Sapo channels.
-- This keeps Sapo-discovered channels intact while allowing confirmed aliases such as
-- social handles, Zalo/IG/Youtube names, and spelling variants to resolve to a channel.

CREATE TABLE IF NOT EXISTS public.sapo_channel_aliases (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  alias_text            TEXT NOT NULL,
  normalized_alias      TEXT NOT NULL,
  platform              TEXT NULL,
  platform_key          TEXT NOT NULL DEFAULT '',
  excel_owner           TEXT NULL,
  excel_month           TEXT NULL,
  excel_revenue         NUMERIC NOT NULL DEFAULT 0,
  channel_id            UUID NULL REFERENCES public.sapo_channels(id) ON DELETE SET NULL,
  owner_member_id       BIGINT NULL REFERENCES public.sapo_members(sapo_user_id) ON DELETE SET NULL,
  source                TEXT NOT NULL DEFAULT 'excel_2026',
  confidence            TEXT NOT NULL DEFAULT 'review',
  status                TEXT NOT NULL DEFAULT 'unmatched',
  candidates            JSONB NOT NULL DEFAULT '[]'::jsonb,
  notes                 TEXT NULL,
  created_at            TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at            TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT sapo_channel_aliases_status_check
    CHECK (status IN ('unmatched', 'ambiguous', 'matched', 'ignored')),
  CONSTRAINT sapo_channel_aliases_confidence_check
    CHECK (confidence IN ('exact', 'manual', 'fuzzy', 'review', 'ignored'))
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_sapo_channel_aliases_unique_source_alias
  ON public.sapo_channel_aliases(source, normalized_alias, platform_key);

CREATE INDEX IF NOT EXISTS idx_sapo_channel_aliases_status
  ON public.sapo_channel_aliases(status);

CREATE INDEX IF NOT EXISTS idx_sapo_channel_aliases_channel
  ON public.sapo_channel_aliases(channel_id);

CREATE INDEX IF NOT EXISTS idx_sapo_channel_aliases_owner
  ON public.sapo_channel_aliases(owner_member_id);

ALTER TABLE public.sapo_channel_aliases ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated can view sapo_channel_aliases" ON public.sapo_channel_aliases
  FOR SELECT TO authenticated USING (true);

CREATE POLICY "Service role can manage sapo_channel_aliases" ON public.sapo_channel_aliases
  FOR ALL TO service_role USING (true) WITH CHECK (true);

CREATE POLICY "Admin can manage sapo_channel_aliases" ON public.sapo_channel_aliases
  FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM public.users WHERE id = auth.uid() AND role IN ('admin', 'media')))
  WITH CHECK (EXISTS (SELECT 1 FROM public.users WHERE id = auth.uid() AND role IN ('admin', 'media')));

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'sapo_channel_aliases_updated_at') THEN
    CREATE TRIGGER sapo_channel_aliases_updated_at BEFORE UPDATE ON public.sapo_channel_aliases
    FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
  END IF;
END $$;
