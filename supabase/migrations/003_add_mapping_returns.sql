-- Migration 003: Add missing tables & columns for new upload features
-- Supports: mapping_imports, return_imports, returns tables
-- Also adds file_type column to revenue_imports

-- ============================================================
-- Add file_type to revenue_imports
-- ============================================================
ALTER TABLE public.revenue_imports 
ADD COLUMN IF NOT EXISTS file_type TEXT NOT NULL DEFAULT 'orders'
CHECK (file_type IN ('orders', 'mapping', 'returns'));

-- ============================================================
-- MAPPING IMPORTS (log mỗi lần upload file DANH_SACH_CAC_KENH_MEDIA)
-- ============================================================
CREATE TABLE IF NOT EXISTS public.mapping_imports (
  id                UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id           UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  file_name         TEXT NOT NULL,
  total_rows        INTEGER NOT NULL DEFAULT 0,
  total_employees   INTEGER NOT NULL DEFAULT 0,
  total_channels    INTEGER NOT NULL DEFAULT 0,
  unassigned_count  INTEGER NOT NULL DEFAULT 0,
  active_from       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  active_to         TIMESTAMPTZ,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE public.mapping_imports ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated can view mapping_imports" ON public.mapping_imports
  FOR SELECT USING (auth.role() = 'authenticated');

CREATE POLICY "Authenticated can insert mapping_imports" ON public.mapping_imports
  FOR INSERT WITH CHECK (auth.role() = 'authenticated');

-- Add mapping_import_id to channel_tags for versioning
ALTER TABLE public.channel_tags 
ADD COLUMN IF NOT EXISTS mapping_import_id UUID REFERENCES public.mapping_imports(id) ON DELETE SET NULL;

ALTER TABLE public.channel_tags 
ADD COLUMN IF NOT EXISTS channel_display TEXT;

ALTER TABLE public.channel_tags 
ADD COLUMN IF NOT EXISTS employee_name TEXT;

-- ============================================================
-- RETURN IMPORTS (log mỗi lần upload file order_return_export)
-- ============================================================
CREATE TABLE IF NOT EXISTS public.return_imports (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id         UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  file_name       TEXT NOT NULL,
  total_returns   INTEGER NOT NULL DEFAULT 0,
  matched_count   INTEGER NOT NULL DEFAULT 0,
  unmatched_count INTEGER NOT NULL DEFAULT 0,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE public.return_imports ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated can view return_imports" ON public.return_imports
  FOR SELECT USING (auth.role() = 'authenticated');

CREATE POLICY "Authenticated can insert return_imports" ON public.return_imports
  FOR INSERT WITH CHECK (auth.role() = 'authenticated');

-- ============================================================
-- RETURNS (đơn trả hàng)
-- ============================================================
CREATE TABLE IF NOT EXISTS public.returns (
  id                  UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  return_code         TEXT NOT NULL UNIQUE,
  return_import_id    UUID NOT NULL REFERENCES public.return_imports(id) ON DELETE CASCADE,
  original_order_code TEXT,
  return_amount       BIGINT NOT NULL DEFAULT 0,
  return_reason       TEXT,
  return_date         TIMESTAMPTZ,
  matched             BOOLEAN NOT NULL DEFAULT FALSE,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_returns_original ON public.returns(original_order_code);

ALTER TABLE public.returns ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated can view returns" ON public.returns
  FOR SELECT USING (auth.role() = 'authenticated');

CREATE POLICY "Authenticated can insert returns" ON public.returns
  FOR INSERT WITH CHECK (auth.role() = 'authenticated');

-- ============================================================
-- Add return tracking columns to orders
-- ============================================================
ALTER TABLE public.orders 
ADD COLUMN IF NOT EXISTS is_returned BOOLEAN NOT NULL DEFAULT FALSE;

ALTER TABLE public.orders 
ADD COLUMN IF NOT EXISTS return_code TEXT;

ALTER TABLE public.orders 
ADD COLUMN IF NOT EXISTS return_amount BIGINT;

ALTER TABLE public.orders 
ADD COLUMN IF NOT EXISTS return_date TIMESTAMPTZ;

SELECT 'Migration 003 complete! Added: mapping_imports, return_imports, returns tables + return tracking on orders.' AS result;
