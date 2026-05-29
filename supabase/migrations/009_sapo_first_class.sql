-- ============================================================
-- Migration 009: Sapo first-class data model
-- ============================================================
-- Bỏ pipeline cũ qua channel_tags/mapping_imports (Excel-based) cho Sapo.
-- Build mô hình dữ liệu mới trực tiếp từ Sapo API:
--   - sapo_members          : danh sách nhân viên Sapo (sync từ /admin/users.json)
--   - sapo_channels         : kênh / fanpage discover từ orders.channel_definition
--   - sapo_orders           : đơn hàng sync trực tiếp từ Sapo (không trộn với orders cũ)
--   - sapo_channel_assignments : map kênh → media member do admin define
--
-- Bảng `orders` cũ (Excel import) được GIỮ NGUYÊN — không drop, không sửa.
-- ============================================================

-- ------------------------------------------------------------
-- 1. sapo_members: nhân viên Sapo (từ /admin/users.json)
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.sapo_members (
  sapo_user_id     BIGINT       PRIMARY KEY,
  email            TEXT,
  first_name       TEXT,
  last_name        TEXT,
  full_name        TEXT,                                  -- denormalized cho query nhanh
  phone_number     TEXT,
  prefix_code      TEXT,                                  -- auto-extract từ full_name: "KD1", "STORE", "TMĐT", ...
  is_media_team    BOOLEAN      NOT NULL DEFAULT FALSE,   -- admin set true cho nhân viên team Traffic/Media
  is_active        BOOLEAN      NOT NULL DEFAULT TRUE,
  last_synced_at   TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  raw              JSONB,
  created_at       TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  updated_at       TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_sapo_members_prefix     ON public.sapo_members(prefix_code);
CREATE INDEX IF NOT EXISTS idx_sapo_members_media_team ON public.sapo_members(is_media_team) WHERE is_media_team = TRUE;

ALTER TABLE public.sapo_members ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Authenticated can view sapo_members" ON public.sapo_members
  FOR SELECT USING (auth.role() = 'authenticated');
CREATE POLICY "Service role can manage sapo_members" ON public.sapo_members
  FOR ALL USING (auth.role() = 'service_role');
CREATE POLICY "Admin can manage sapo_members" ON public.sapo_members
  FOR ALL USING (
    EXISTS (SELECT 1 FROM public.users WHERE id = auth.uid() AND role = 'admin')
  );

-- ------------------------------------------------------------
-- 2. sapo_channels: kênh bán hàng / fanpage (auto-discovered)
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.sapo_channels (
  id                    UUID          PRIMARY KEY DEFAULT gen_random_uuid(),
  alias                 TEXT          NOT NULL,           -- "facebook", "tiktokshop", "pos", "zalo"
  main_name             TEXT,                              -- "Chat OmniAI", "Tiktokshop"
  sub_name              TEXT,                              -- "Facebook", "Tiktok for Business"
  branch_name           TEXT,                              -- "HuyK - Kim Hoàn"
  branch_external_id    TEXT,                              -- FB page id, TikTok shop id
  platform              TEXT          NOT NULL,            -- chuẩn hoá: "facebook" | "tiktok" | "zalo" | "pos" | "web" | "other"
  app_alias             TEXT,                              -- "social-channel", "tiktok-channel", "sapo-pos"
  media_member_id       BIGINT        REFERENCES public.sapo_members(sapo_user_id) ON DELETE SET NULL,
  is_active             BOOLEAN       NOT NULL DEFAULT TRUE,
  first_seen_at         TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
  last_seen_at          TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
  orders_count          INTEGER       NOT NULL DEFAULT 0,  -- denormalized cho dashboard nhanh
  created_at            TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
  updated_at            TIMESTAMPTZ   NOT NULL DEFAULT NOW()
);

-- Unique key: 1 channel = (alias, branch_external_id) hoặc (alias, branch_name) khi external_id null
CREATE UNIQUE INDEX IF NOT EXISTS idx_sapo_channels_unique_ext
  ON public.sapo_channels(alias, branch_external_id) WHERE branch_external_id IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS idx_sapo_channels_unique_name
  ON public.sapo_channels(alias, branch_name) WHERE branch_external_id IS NULL;
CREATE INDEX IF NOT EXISTS idx_sapo_channels_platform     ON public.sapo_channels(platform);
CREATE INDEX IF NOT EXISTS idx_sapo_channels_media_member ON public.sapo_channels(media_member_id);

ALTER TABLE public.sapo_channels ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Authenticated can view sapo_channels" ON public.sapo_channels
  FOR SELECT USING (auth.role() = 'authenticated');
CREATE POLICY "Service role can manage sapo_channels" ON public.sapo_channels
  FOR ALL USING (auth.role() = 'service_role');
CREATE POLICY "Admin can manage sapo_channels" ON public.sapo_channels
  FOR ALL USING (
    EXISTS (SELECT 1 FROM public.users WHERE id = auth.uid() AND role IN ('admin','media'))
  );

-- ------------------------------------------------------------
-- 3. sapo_orders: đơn hàng sync trực tiếp từ Sapo
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.sapo_orders (
  sapo_order_id        BIGINT        PRIMARY KEY,
  order_number         TEXT          NOT NULL,            -- "HK82063" (= field `name` của Sapo)
  store                TEXT          NOT NULL,            -- vd "vienchibao"

  -- Attribution
  creator_member_id    BIGINT        REFERENCES public.sapo_members(sapo_user_id) ON DELETE SET NULL,  -- user_id (người tạo)
  assignee_member_id   BIGINT        REFERENCES public.sapo_members(sapo_user_id) ON DELETE SET NULL,  -- assignee_id (người được giao)
  channel_id           UUID          REFERENCES public.sapo_channels(id) ON DELETE SET NULL,
  sapo_location_id     BIGINT,                                                                          -- chi nhánh xử lý
  platform             TEXT,                                                                            -- denormalized từ channel

  -- Trạng thái + tiền
  status               TEXT,                                                                            -- open / closed / cancelled
  financial_status     TEXT,                                                                            -- paid / pending / refunded / ...
  fulfillment_status   TEXT,
  total_price          BIGINT        NOT NULL DEFAULT 0,                                                -- VND
  total_received       BIGINT        NOT NULL DEFAULT 0,
  total_refunded       BIGINT        NOT NULL DEFAULT 0,
  currency             TEXT          NOT NULL DEFAULT 'VND',

  -- Thời gian
  created_on           TIMESTAMPTZ,
  modified_on          TIMESTAMPTZ,
  processed_on         TIMESTAMPTZ,
  cancelled_on         TIMESTAMPTZ,
  paid_on              TIMESTAMPTZ,

  -- Marketing / UTM
  source_name          TEXT,                                                                            -- "facebook", "tiktokshop", ...
  landing_site         TEXT,                                                                            -- URL chiến dịch đầy đủ
  utm_campaign         TEXT,                                                                            -- extract từ landing_site
  utm_source           TEXT,
  utm_medium           TEXT,

  -- Raw + tags
  tags                 TEXT,                                                                            -- raw tags comma-separated
  raw                 JSONB,

  -- Audit
  first_synced_at      TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
  last_synced_at       TIMESTAMPTZ   NOT NULL DEFAULT NOW()
  -- LƯU Ý: KHÔNG đặt UNIQUE (order_number, store) vì Sapo có thể tái sử dụng order_number
  --       (case cancel+recreate). Chỉ PK sapo_order_id là unique.
);

CREATE INDEX IF NOT EXISTS idx_sapo_orders_creator       ON public.sapo_orders(creator_member_id);
CREATE INDEX IF NOT EXISTS idx_sapo_orders_assignee      ON public.sapo_orders(assignee_member_id);
CREATE INDEX IF NOT EXISTS idx_sapo_orders_channel       ON public.sapo_orders(channel_id);
CREATE INDEX IF NOT EXISTS idx_sapo_orders_platform      ON public.sapo_orders(platform);
CREATE INDEX IF NOT EXISTS idx_sapo_orders_created_on    ON public.sapo_orders(created_on DESC);
CREATE INDEX IF NOT EXISTS idx_sapo_orders_modified_on   ON public.sapo_orders(modified_on DESC);
CREATE INDEX IF NOT EXISTS idx_sapo_orders_financial     ON public.sapo_orders(financial_status);
CREATE INDEX IF NOT EXISTS idx_sapo_orders_store         ON public.sapo_orders(store);

ALTER TABLE public.sapo_orders ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Authenticated can view sapo_orders" ON public.sapo_orders
  FOR SELECT USING (auth.role() = 'authenticated');
CREATE POLICY "Service role can manage sapo_orders" ON public.sapo_orders
  FOR ALL USING (auth.role() = 'service_role');

-- ------------------------------------------------------------
-- 4. sapo_sync_state: track cursor incremental sync
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.sapo_sync_state (
  store                    TEXT         PRIMARY KEY,
  members_last_sync_at     TIMESTAMPTZ,
  orders_last_sync_at      TIMESTAMPTZ,
  orders_cursor_modified_on TIMESTAMPTZ,
  total_orders_synced      BIGINT       NOT NULL DEFAULT 0,
  total_members_synced     INTEGER      NOT NULL DEFAULT 0,
  total_channels_discovered INTEGER     NOT NULL DEFAULT 0,
  last_error               TEXT,
  updated_at               TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

ALTER TABLE public.sapo_sync_state ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Authenticated can view sapo_sync_state" ON public.sapo_sync_state
  FOR SELECT USING (auth.role() = 'authenticated');
CREATE POLICY "Service role can manage sapo_sync_state" ON public.sapo_sync_state
  FOR ALL USING (auth.role() = 'service_role');

-- ------------------------------------------------------------
-- 5. Triggers: auto-update updated_at
-- ------------------------------------------------------------
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'sapo_members_updated_at') THEN
    CREATE TRIGGER sapo_members_updated_at BEFORE UPDATE ON public.sapo_members
      FOR EACH ROW EXECUTE PROCEDURE update_updated_at_column();
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'sapo_channels_updated_at') THEN
    CREATE TRIGGER sapo_channels_updated_at BEFORE UPDATE ON public.sapo_channels
      FOR EACH ROW EXECUTE PROCEDURE update_updated_at_column();
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'sapo_sync_state_updated_at') THEN
    CREATE TRIGGER sapo_sync_state_updated_at BEFORE UPDATE ON public.sapo_sync_state
      FOR EACH ROW EXECUTE PROCEDURE update_updated_at_column();
  END IF;
END $$;

-- ------------------------------------------------------------
-- 6. View tổng hợp doanh thu theo media member
-- ------------------------------------------------------------
CREATE OR REPLACE VIEW public.v_sapo_member_revenue AS
SELECT
  m.sapo_user_id,
  m.full_name,
  m.prefix_code,
  m.is_media_team,
  c.id                                                    AS channel_id,
  c.platform                                              AS platform,
  c.branch_name                                           AS channel_name,
  DATE_TRUNC('day', o.created_on)                         AS day,
  COUNT(*)                                                AS orders_count,
  SUM(o.total_price)                                      AS revenue_total_price,
  SUM(CASE WHEN o.financial_status = 'paid' THEN o.total_price ELSE 0 END)
                                                          AS revenue_paid,
  SUM(o.total_received)                                   AS revenue_received,
  SUM(o.total_refunded)                                   AS revenue_refunded
FROM public.sapo_orders o
LEFT JOIN public.sapo_channels c ON c.id = o.channel_id
LEFT JOIN public.sapo_members m  ON m.sapo_user_id = c.media_member_id
WHERE o.status != 'cancelled' OR o.status IS NULL
GROUP BY m.sapo_user_id, m.full_name, m.prefix_code, m.is_media_team, c.id, c.platform, c.branch_name, DATE_TRUNC('day', o.created_on);

SELECT 'Migration 009 complete: Sapo first-class tables (sapo_members, sapo_channels, sapo_orders, sapo_sync_state) + v_sapo_member_revenue view.' AS result;
