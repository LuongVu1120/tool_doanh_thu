-- =================================================================
-- SEED: Default channel tag templates
-- Run this AFTER creating your first users and setting their roles
-- =================================================================

-- Note: Replace the UUID below with actual employee user IDs from your auth.users table.
-- You can find these in Supabase Dashboard → Authentication → Users

-- Example seed (uncomment and replace UUIDs):
-- INSERT INTO public.channel_tags (tag, normalized_tag, employee_id, platform, is_active)
-- VALUES
--   ('page_HuyK - Kim Hoàn 1', 'page_huyk-kim hoàn 1', 'YOUR_EMPLOYEE_UUID_1', 'facebook', true),
--   ('page_HuyK - Kim Hoàn 2', 'page_huyk-kim hoàn 2', 'YOUR_EMPLOYEE_UUID_2', 'facebook', true),
--   ('page_HuyK - Nhẫn Cưới', 'page_huyk-nhẫn cưới', 'YOUR_EMPLOYEE_UUID_1', 'facebook', true),
--   ('page_HuyK - Trang Sức', 'page_huyk-trang sức', 'YOUR_EMPLOYEE_UUID_3', 'facebook', true),
--   ('tiktok_business_HuyK - Kim Hoàn', 'tiktok_business_huyk-kim hoàn', 'YOUR_EMPLOYEE_UUID_1', 'tiktok', true),
--   ('tiktok_business_HuyK - Nhẫn Cưới', 'tiktok_business_huyk-nhẫn cưới', 'YOUR_EMPLOYEE_UUID_2', 'tiktok', true)
-- ON CONFLICT (normalized_tag) DO NOTHING;

-- =================================================================
-- SEED: Default KPI targets (example for current month)
-- =================================================================
-- Replace with actual period and employee UUIDs:
-- INSERT INTO public.kpi_targets (employee_id, period, target_amount)
-- VALUES
--   ('YOUR_EMPLOYEE_UUID_1', '2026-05', 50000000),
--   ('YOUR_EMPLOYEE_UUID_2', '2026-05', 50000000)
-- ON CONFLICT (employee_id, period) DO NOTHING;

-- =================================================================
-- Make the first registered user an admin
-- Run this manually in the Supabase SQL editor after signup:
-- =================================================================
-- UPDATE public.users SET role = 'admin' WHERE email = 'your-admin@email.com';
-- UPDATE public.users SET role = 'media' WHERE email = 'media-team-member@email.com';

SELECT 'Seed file loaded. Update the commented INSERT statements with real UUIDs and run them.' AS note;
