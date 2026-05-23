-- Migration 004: Align schema to match application code expectations
-- Run this in Supabase SQL editor if you used 001_initial_schema_v2.sql
-- ============================================================

-- ============================================================
-- 1. revenue_imports: rename user_id → uploaded_by, add stats columns
-- ============================================================
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'revenue_imports' AND column_name = 'user_id'
  ) THEN
    ALTER TABLE public.revenue_imports RENAME COLUMN user_id TO uploaded_by;
  END IF;
END $$;

-- Drop old status constraint, migrate existing values, then add new constraint
ALTER TABLE public.revenue_imports DROP CONSTRAINT IF EXISTS revenue_imports_status_check;
-- Map old v2 status values → new values
UPDATE public.revenue_imports SET status = 'done'       WHERE status IN ('confirmed', 'preview');
UPDATE public.revenue_imports SET status = 'processing' WHERE status IN ('pending', 'needs_review');
UPDATE public.revenue_imports SET status = 'error'      WHERE status = 'failed';
ALTER TABLE public.revenue_imports ALTER COLUMN status DROP DEFAULT;
ALTER TABLE public.revenue_imports ALTER COLUMN status SET DEFAULT 'processing';
ALTER TABLE public.revenue_imports ADD CONSTRAINT revenue_imports_status_check
  CHECK (status IN ('processing', 'done', 'error'));

-- Add stats columns if missing
ALTER TABLE public.revenue_imports ADD COLUMN IF NOT EXISTS orders_upserted INT NOT NULL DEFAULT 0;
ALTER TABLE public.revenue_imports ADD COLUMN IF NOT EXISTS orders_new INT NOT NULL DEFAULT 0;
ALTER TABLE public.revenue_imports ADD COLUMN IF NOT EXISTS orders_status_changed INT NOT NULL DEFAULT 0;

-- Remove columns that don't match current code (safe to ignore if already absent)
ALTER TABLE public.revenue_imports DROP COLUMN IF EXISTS period;
ALTER TABLE public.revenue_imports DROP COLUMN IF EXISTS file_url;
ALTER TABLE public.revenue_imports DROP COLUMN IF EXISTS total_rows;
ALTER TABLE public.revenue_imports DROP COLUMN IF EXISTS filtered_rows;
ALTER TABLE public.revenue_imports DROP COLUMN IF EXISTS duplicates_skipped;
ALTER TABLE public.revenue_imports DROP COLUMN IF EXISTS exchanges_excluded;
ALTER TABLE public.revenue_imports DROP COLUMN IF EXISTS needs_review_count;
ALTER TABLE public.revenue_imports DROP COLUMN IF EXISTS final_orders;
ALTER TABLE public.revenue_imports DROP COLUMN IF EXISTS updated_at;

-- ============================================================
-- 2. mapping_imports: rename user_id → uploaded_by
-- ============================================================
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'mapping_imports' AND column_name = 'user_id'
  ) THEN
    ALTER TABLE public.mapping_imports RENAME COLUMN user_id TO uploaded_by;
  END IF;
END $$;

-- ============================================================
-- 3. return_imports: rename user_id → uploaded_by
-- ============================================================
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'return_imports' AND column_name = 'user_id'
  ) THEN
    ALTER TABLE public.return_imports RENAME COLUMN user_id TO uploaded_by;
  END IF;
END $$;

-- ============================================================
-- 4. channel_tags: rename tag columns, remove old columns
-- ============================================================
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'channel_tags' AND column_name = 'tag_normalized'
  ) THEN
    ALTER TABLE public.channel_tags RENAME COLUMN tag_normalized TO tag_name_normalized;
  END IF;
END $$;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'channel_tags' AND column_name = 'tag_original'
  ) THEN
    ALTER TABLE public.channel_tags RENAME COLUMN tag_original TO tag_name_original;
  END IF;
END $$;

-- Remove old columns no longer needed
DROP INDEX IF EXISTS idx_channel_tags_active;
ALTER TABLE public.channel_tags DROP COLUMN IF EXISTS platform;
ALTER TABLE public.channel_tags DROP COLUMN IF EXISTS effective_from;
ALTER TABLE public.channel_tags DROP COLUMN IF EXISTS effective_to;
ALTER TABLE public.channel_tags DROP COLUMN IF EXISTS is_active;
ALTER TABLE public.channel_tags DROP COLUMN IF EXISTS updated_at;

-- Add employee_id as nullable text (not UUID FK) for name storage
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'channel_tags' AND column_name = 'employee_id'
  ) THEN
    ALTER TABLE public.channel_tags ADD COLUMN employee_id TEXT;
  END IF;
END $$;

-- If employee_id is currently a UUID type (from v2), drop and re-add as TEXT
DO $$
DECLARE
  col_type TEXT;
BEGIN
  SELECT data_type INTO col_type
  FROM information_schema.columns
  WHERE table_schema = 'public' AND table_name = 'channel_tags' AND column_name = 'employee_id';

  IF col_type = 'uuid' THEN
    ALTER TABLE public.channel_tags DROP COLUMN employee_id;
    ALTER TABLE public.channel_tags ADD COLUMN employee_id TEXT;
  END IF;
END $$;

-- ============================================================
-- 5. orders: drop v2 table and recreate with correct schema
-- ============================================================
DROP TABLE IF EXISTS public.orders_excluded CASCADE;
DROP TABLE IF EXISTS public.orders CASCADE;

CREATE TABLE public.orders (
  order_code          TEXT PRIMARY KEY,
  source              TEXT,
  status              TEXT,
  channel_tag_matched TEXT,
  employee_name       TEXT,
  employee_id         TEXT,
  completion_date     TIMESTAMPTZ,
  total_amount        BIGINT NOT NULL DEFAULT 0,
  raw_tags            TEXT,
  notes               TEXT,
  first_imported_at   TIMESTAMPTZ,
  last_updated_at     TIMESTAMPTZ,
  is_returned         BOOLEAN NOT NULL DEFAULT FALSE,
  return_code         TEXT,
  return_amount       BIGINT,
  return_date         TIMESTAMPTZ,
  period_locked       BOOLEAN NOT NULL DEFAULT FALSE
);

CREATE INDEX idx_orders_employee      ON public.orders(employee_name);
CREATE INDEX idx_orders_completion    ON public.orders(completion_date);
CREATE INDEX idx_orders_channel       ON public.orders(channel_tag_matched);
CREATE INDEX idx_orders_period_locked ON public.orders(period_locked);

ALTER TABLE public.orders ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated can view orders" ON public.orders
  FOR SELECT USING (auth.role() = 'authenticated');

CREATE POLICY "Authenticated can insert orders" ON public.orders
  FOR INSERT WITH CHECK (auth.role() = 'authenticated');

CREATE POLICY "Authenticated can update orders" ON public.orders
  FOR UPDATE USING (auth.role() = 'authenticated');

-- ============================================================
-- 6. Add RLS update policy on revenue_imports if missing
-- ============================================================
DROP POLICY IF EXISTS "Users can update own imports" ON public.revenue_imports;
CREATE POLICY "Authenticated can update imports" ON public.revenue_imports
  FOR UPDATE USING (auth.role() = 'authenticated');

SELECT 'Migration 004 complete! Schema aligned to application code.' AS result;
