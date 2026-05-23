-- ============================================================
-- SEED: 27 Channel Tags (từ file mẫu Sapo 50 ngày)
-- Chạy SAU KHI đã tạo schema (001_initial_schema_v2.sql)
-- ============================================================
-- Lưu ý: employee_id = NULL → admin sẽ map sau qua wizard
--         Khi admin map nhân viên, UPDATE employee_id và effective_from
-- ============================================================

INSERT INTO public.channel_tags (tag_original, tag_normalized, employee_id, platform, effective_from, is_active)
VALUES
  -- TikTok tags (4 tags)
  ('tiktok_business_HuyK- Xưởng Vàng Bạc 2',  'tiktok_business_huyk-xưởng vàng bạc 2',   NULL, 'tiktok',   '2026-01-01', true),
  ('tiktok_business_HuyK - Kim Hoàn Viễn Chí Bảo', 'tiktok_business_huyk-kim hoàn viễn chí bảo', NULL, 'tiktok', '2026-01-01', true),
  ('tiktok_business_HuyK - Trang Sức Chế Tác', 'tiktok_business_huyk-trang sức chế tác', NULL, 'tiktok',   '2026-01-01', true),
  ('tiktok_business_HuyK-Viễn Chí Bảo',        'tiktok_business_huyk-viễn chí bảo',      NULL, 'tiktok',   '2026-01-01', true),
  ('tiktok_business_HuyK - Xưởng Vàng Bạc',    'tiktok_business_huyk-xưởng vàng bạc',    NULL, 'tiktok',   '2026-01-01', true),
  ('tiktok_business_HuyK - Trang Sức Bạc Thái', 'tiktok_business_huyk-trang sức bạc thái', NULL, 'tiktok',  '2026-01-01', true),

  -- Facebook tags (21 tags)
  ('page_HuyK - Kim Hoàn',                     'page_huyk-kim hoàn',                     NULL, 'facebook', '2026-01-01', true),
  ('page_HuyK - Mê kim hoàn',                  'page_huyk-mê kim hoàn',                  NULL, 'facebook', '2026-01-01', true),
  ('page_HuyK - Trang Sức Chế Tác',            'page_huyk-trang sức chế tác',            NULL, 'facebook', '2026-01-01', true),
  ('page_HuyK Viễn Chí Bảo',                   'page_huyk-viễn chí bảo',                 NULL, 'facebook', '2026-01-01', true),
  ('page_HuyK - Trang sức thiết kế',           'page_huyk-trang sức thiết kế',           NULL, 'facebook', '2026-01-01', true),
  ('page_HuyK - Xưởng Vàng Bạc',               'page_huyk-xưởng vàng bạc',               NULL, 'facebook', '2026-01-01', true),
  ('page_HuyK - Xưởng Chế Tác',                'page_huyk-xưởng chế tác',                NULL, 'facebook', '2026-01-01', true),
  ('page_HuyK Thợ trang sức thủ công',         'page_huyk-thợ trang sức thủ công',       NULL, 'facebook', '2026-01-01', true),
  ('page_HuyK - Xưởng Kim Hoàn',               'page_huyk-xưởng kim hoàn',               NULL, 'facebook', '2026-01-01', true),
  ('page_HuyK Jewelry',                        'page_huyk-jewelry',                      NULL, 'facebook', '2026-01-01', true),
  ('page_HuyK - Chế Tác Kim Hoàn',             'page_huyk-chế tác kim hoàn',             NULL, 'facebook', '2026-01-01', true),
  ('page_HuyK Jeweler',                        'page_huyk-jeweler',                      NULL, 'facebook', '2026-01-01', true),
  ('page_HuyK Trang Sức Đá Quý',               'page_huyk-trang sức đá quý',             NULL, 'facebook', '2026-01-01', true),
  ('page_HuyK Thợ Chế Tác',                    'page_huyk-thợ chế tác',                  NULL, 'facebook', '2026-01-01', true),
  ('page_HuyK Vàng Bạc Đá Quý',                'page_huyk-vàng bạc đá quý',              NULL, 'facebook', '2026-01-01', true),
  -- 6 tag còn lại (<10 đơn mỗi tag, tên chính xác sẽ cập nhật sau khi có file thô)
  ('page_HuyK - Nhẫn Cưới',                    'page_huyk-nhẫn cưới',                    NULL, 'facebook', '2026-01-01', true),
  ('page_HuyK - Trang Sức Cưới',               'page_huyk-trang sức cưới',               NULL, 'facebook', '2026-01-01', true),
  ('page_HuyK - Lắc tay',                      'page_huyk-lắc tay',                      NULL, 'facebook', '2026-01-01', true),
  ('page_HuyK - Dây Chuyền',                   'page_huyk-dây chuyền',                   NULL, 'facebook', '2026-01-01', true),
  ('page_HuyK - Bông Tai',                     'page_huyk-bông tai',                     NULL, 'facebook', '2026-01-01', true),
  ('page_HuyK - Phụ Kiện',                     'page_huyk-phụ kiện',                     NULL, 'facebook', '2026-01-01', true)
ON CONFLICT (tag_normalized) WHERE effective_to IS NULL AND is_active = TRUE
DO NOTHING;

-- ============================================================
-- Verify: Đếm số tag đã seed
-- ============================================================
SELECT 
  platform,
  COUNT(*) AS tag_count
FROM public.channel_tags 
WHERE is_active = TRUE AND effective_to IS NULL
GROUP BY platform
ORDER BY platform;

SELECT '✅ Seed complete! ' || COUNT(*) || ' tags inserted.' AS result
FROM public.channel_tags 
WHERE is_active = TRUE AND effective_to IS NULL;
