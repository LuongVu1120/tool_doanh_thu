-- Migration 007: Recognized revenue + manual adjustments for PDF reconciliation

ALTER TABLE public.orders
  ADD COLUMN IF NOT EXISTS order_date DATE,
  ADD COLUMN IF NOT EXISTS original_amount BIGINT,
  ADD COLUMN IF NOT EXISTS recognized_amount BIGINT,
  ADD COLUMN IF NOT EXISTS exchange_type TEXT NOT NULL DEFAULT 'none'
    CHECK (exchange_type IN ('none', 'no_extra', 'with_extra', 'needs_review')),
  ADD COLUMN IF NOT EXISTS review_status TEXT NOT NULL DEFAULT 'none'
    CHECK (review_status IN ('none', 'pending', 'included', 'excluded')),
  ADD COLUMN IF NOT EXISTS review_resolution JSONB;

UPDATE public.orders
SET
  original_amount = COALESCE(original_amount, total_amount),
  recognized_amount = COALESCE(recognized_amount, total_amount)
WHERE original_amount IS NULL OR recognized_amount IS NULL;

ALTER TABLE public.orders
  ALTER COLUMN original_amount SET DEFAULT 0,
  ALTER COLUMN recognized_amount SET DEFAULT 0;

CREATE INDEX IF NOT EXISTS idx_orders_recognized_amount ON public.orders(recognized_amount);
CREATE INDEX IF NOT EXISTS idx_orders_review_status ON public.orders(review_status);

CREATE TABLE IF NOT EXISTS public.revenue_adjustments (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  period TEXT NOT NULL,
  employee_name TEXT NOT NULL,
  channel_group TEXT NOT NULL,
  channel_name TEXT NOT NULL,
  amount BIGINT NOT NULL DEFAULT 0,
  reason TEXT,
  source_label TEXT,
  created_by UUID REFERENCES public.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_revenue_adjustments_period ON public.revenue_adjustments(period);
CREATE INDEX IF NOT EXISTS idx_revenue_adjustments_employee ON public.revenue_adjustments(employee_name);

ALTER TABLE public.revenue_adjustments ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Authenticated can view revenue adjustments" ON public.revenue_adjustments;
CREATE POLICY "Authenticated can view revenue adjustments" ON public.revenue_adjustments
  FOR SELECT USING (auth.role() = 'authenticated');

DROP POLICY IF EXISTS "Authenticated can insert revenue adjustments" ON public.revenue_adjustments;
CREATE POLICY "Authenticated can insert revenue adjustments" ON public.revenue_adjustments
  FOR INSERT WITH CHECK (auth.role() = 'authenticated');

DROP POLICY IF EXISTS "Authenticated can update revenue adjustments" ON public.revenue_adjustments;
CREATE POLICY "Authenticated can update revenue adjustments" ON public.revenue_adjustments
  FOR UPDATE USING (auth.role() = 'authenticated');

DROP POLICY IF EXISTS "Authenticated can delete revenue adjustments" ON public.revenue_adjustments;
CREATE POLICY "Authenticated can delete revenue adjustments" ON public.revenue_adjustments
  FOR DELETE USING (auth.role() = 'authenticated');

SELECT 'Migration 007 complete! Added recognized revenue and revenue_adjustments.' AS result;
