-- Migration 005: Clear orders and imports to allow re-upload with fixed date logic
-- Run this BEFORE re-uploading data files

TRUNCATE TABLE public.returns CASCADE;
TRUNCATE TABLE public.orders CASCADE;
TRUNCATE TABLE public.return_imports CASCADE;
TRUNCATE TABLE public.revenue_imports CASCADE;

SELECT 'Cleared: orders, returns, revenue_imports, return_imports. Ready for re-upload.' AS result;
