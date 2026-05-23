-- Migration 006: Change completion_date column from TIMESTAMPTZ to DATE
-- This eliminates timezone shift bugs where Vietnam midnight orders (UTC+7)
-- would be stored as the previous day in UTC, causing incorrect month filtering.

ALTER TABLE public.orders
  ALTER COLUMN completion_date TYPE DATE
  USING completion_date::DATE;

SELECT 'Migration 006 complete! completion_date is now DATE type (no timezone shift).' AS result;
