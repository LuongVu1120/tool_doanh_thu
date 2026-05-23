-- ============================================================
-- HuyK Tools V1 — Database Schema (Production-Ready)
-- Version: 1.0-final
-- Generated: 2026-05-22
-- ============================================================
-- Cách dùng:
--   1. Vào Supabase Dashboard → SQL Editor
--   2. Copy toàn bộ file này, paste vào editor
--   3. Bấm "Run"
-- ============================================================

-- Enable UUID generation
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ============================================================
-- 1. USERS
--    Tự động sync từ auth.users qua trigger
--    role: admin (toàn quyền), media (xem+upload), viewer (chỉ xem)
-- ============================================================
CREATE TABLE IF NOT EXISTS public.users (
  id          UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  email       TEXT NOT NULL UNIQUE,
  full_name   TEXT,
  avatar_url  TEXT,
  role        TEXT NOT NULL DEFAULT 'viewer'
              CHECK (role IN ('admin', 'media', 'viewer')),
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE public.users ENABLE ROW LEVEL SECURITY;

-- RLS: Mọi user đã login đều xem được profile của nhau
CREATE POLICY "Users can view all profiles" ON public.users
  FOR SELECT USING (auth.role() = 'authenticated');

CREATE POLICY "Users can update own profile" ON public.users
  FOR UPDATE USING (auth.uid() = id);

CREATE POLICY "Users can insert own profile" ON public.users
  FOR INSERT WITH CHECK (auth.uid() = id);

-- ============================================================
-- 2. CHANNEL TAGS (Mapping tag kênh → nhân viên)
--    Có versioning: mỗi tag có thể đổi người phụ trách theo thời gian
--    employee_id = NULL nghĩa là tag chưa được map (admin cần map)
-- ============================================================
CREATE TABLE IF NOT EXISTS public.channel_tags (
  id               UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  tag_original     TEXT NOT NULL,                    -- Tag gốc từ Sapo
  tag_normalized   TEXT NOT NULL,                    -- Tag đã normalize (lowercase, trim)
  employee_id      UUID REFERENCES public.users(id) ON DELETE SET NULL,
  platform         TEXT NOT NULL CHECK (platform IN ('facebook', 'tiktok', 'zalo')),
  effective_from   DATE NOT NULL DEFAULT CURRENT_DATE,
  effective_to     DATE,                             -- NULL = vẫn còn hiệu lực
  is_active        BOOLEAN NOT NULL DEFAULT TRUE,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Mỗi tag chỉ có 1 mapping active tại 1 thời điểm
CREATE UNIQUE INDEX idx_channel_tags_active
  ON public.channel_tags(tag_normalized)
  WHERE effective_to IS NULL AND is_active = TRUE;

CREATE INDEX idx_channel_tags_employee ON public.channel_tags(employee_id);
CREATE INDEX idx_channel_tags_normalized ON public.channel_tags(tag_normalized);

ALTER TABLE public.channel_tags ENABLE ROW LEVEL SECURITY;

-- RLS: Mọi authenticated user có thể xem channel_tags
CREATE POLICY "Authenticated can view channel tags" ON public.channel_tags
  FOR SELECT USING (auth.role() = 'authenticated');

-- Chỉ admin mới quản lý được mapping (theo PRD, V1 ai cũng làm được,
-- nhưng để an toàn thì giới hạn admin + media)
CREATE POLICY "Admin and media can manage channel tags" ON public.channel_tags
  FOR ALL USING (
    EXISTS (
      SELECT 1 FROM public.users
      WHERE id = auth.uid() AND role IN ('admin', 'media')
    )
  );

-- ============================================================
-- 3. REVENUE IMPORTS (Log mỗi lần upload Excel)
-- ============================================================
CREATE TABLE IF NOT EXISTS public.revenue_imports (
  id                  UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id             UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  file_name           TEXT NOT NULL,
  file_url            TEXT,                         -- URL file trên Supabase Storage (nếu lưu)
  period              TEXT NOT NULL,                -- "YYYY-MM"
  status              TEXT NOT NULL DEFAULT 'pending'
                      CHECK (status IN ('pending', 'preview', 'needs_review', 'confirmed', 'failed')),
  total_rows          INTEGER NOT NULL DEFAULT 0,
  filtered_rows       INTEGER NOT NULL DEFAULT 0,
  duplicates_skipped  INTEGER NOT NULL DEFAULT 0,
  exchanges_excluded  INTEGER NOT NULL DEFAULT 0,
  needs_review_count  INTEGER NOT NULL DEFAULT 0,
  final_orders        INTEGER NOT NULL DEFAULT 0,
  error_message       TEXT,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_imports_user_period ON public.revenue_imports(user_id, period);
CREATE INDEX idx_imports_period ON public.revenue_imports(period);
CREATE INDEX idx_imports_status ON public.revenue_imports(status);

ALTER TABLE public.revenue_imports ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated can view imports" ON public.revenue_imports
  FOR SELECT USING (auth.role() = 'authenticated');

CREATE POLICY "Authenticated can create imports" ON public.revenue_imports
  FOR INSERT WITH CHECK (auth.role() = 'authenticated');

CREATE POLICY "Creator or admin can update imports" ON public.revenue_imports
  FOR UPDATE USING (
    user_id = auth.uid() OR
    EXISTS (SELECT 1 FROM public.users WHERE id = auth.uid() AND role = 'admin')
  );

-- ============================================================
-- 4. ORDERS (Bảng chính — đơn hàng đã được tính doanh thu)
--    Mỗi đơn là unique theo (order_code, period)
-- ============================================================
CREATE TABLE IF NOT EXISTS public.orders (
  id                UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  import_id         UUID NOT NULL REFERENCES public.revenue_imports(id) ON DELETE CASCADE,
  order_code        TEXT NOT NULL,
  source            TEXT NOT NULL,                  -- "Facebook" / "Tiktok for Business"
  channel_tag       TEXT,                           -- Tag kênh đã normalize
  employee_id       UUID REFERENCES public.users(id) ON DELETE SET NULL,
  total_amount      BIGINT NOT NULL DEFAULT 0,      -- Tổng tiền gốc (VND)
  effective_amount  BIGINT NOT NULL DEFAULT 0,      -- Số tiền được tính doanh thu (sau xử lý đổi hàng)
  exchange_status   TEXT NOT NULL DEFAULT 'normal'
                    CHECK (exchange_status IN ('normal', 'exchange_no_extra', 'exchange_with_extra', 'needs_review')),
  exchange_reference TEXT,                          -- Mã đơn gốc nếu là đơn đổi
  notes             TEXT,                           -- Ghi chú từ Sapo
  raw_tags          TEXT,                           -- Tags gốc (comma-separated)
  completed_at      TIMESTAMPTZ NOT NULL,           -- Ngày hoàn thành đơn
  period            TEXT NOT NULL,                  -- "YYYY-MM" (denormalized để query nhanh)
  is_locked         BOOLEAN NOT NULL DEFAULT FALSE, -- true = đã chốt sổ
  reviewed_by       UUID REFERENCES public.users(id) ON DELETE SET NULL,
  reviewed_at       TIMESTAMPTZ,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Unique: 1 order_code chỉ xuất hiện 1 lần trong cùng period
CREATE UNIQUE INDEX idx_orders_code_period ON public.orders(order_code, period);
CREATE INDEX idx_orders_employee_period ON public.orders(employee_id, period);
CREATE INDEX idx_orders_period ON public.orders(period);
CREATE INDEX idx_orders_import ON public.orders(import_id);
CREATE INDEX idx_orders_locked ON public.orders(is_locked);

ALTER TABLE public.orders ENABLE ROW LEVEL SECURITY;

-- RLS: Mọi authenticated user xem được orders (V1 không phân quyền data)
CREATE POLICY "Authenticated can view orders" ON public.orders
  FOR SELECT USING (auth.role() = 'authenticated');

-- Insert/Update qua API route (service_role hoặc owner của import)
CREATE POLICY "Authenticated can insert orders" ON public.orders
  FOR INSERT WITH CHECK (auth.role() = 'authenticated');

CREATE POLICY "Creator or admin can update orders" ON public.orders
  FOR UPDATE USING (
    EXISTS (
      SELECT 1 FROM public.revenue_imports ri
      WHERE ri.id = import_id AND ri.user_id = auth.uid()
    ) OR
    EXISTS (SELECT 1 FROM public.users WHERE id = auth.uid() AND role = 'admin')
  );

-- ============================================================
-- 5. ORDERS EXCLUDED (Đơn bị loại — audit log)
-- ============================================================
CREATE TABLE IF NOT EXISTS public.orders_excluded (
  id           UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  import_id    UUID NOT NULL REFERENCES public.revenue_imports(id) ON DELETE CASCADE,
  order_code   TEXT NOT NULL,
  source       TEXT NOT NULL,
  total_amount BIGINT NOT NULL DEFAULT 0,
  reason       TEXT NOT NULL,                       -- duplicate, not_media_source, no_channel_tag, exchange_no_extra, out_of_period, ...
  notes        TEXT,
  raw_tags     TEXT,
  raw_data     JSONB,                              -- Lưu raw data của dòng để debug sau
  completed_at TIMESTAMPTZ NOT NULL,
  period       TEXT NOT NULL,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_excluded_import ON public.orders_excluded(import_id);
CREATE INDEX idx_excluded_period ON public.orders_excluded(period);

ALTER TABLE public.orders_excluded ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated can view excluded" ON public.orders_excluded
  FOR SELECT USING (auth.role() = 'authenticated');

CREATE POLICY "Authenticated can insert excluded" ON public.orders_excluded
  FOR INSERT WITH CHECK (auth.role() = 'authenticated');

-- ============================================================
-- 6. KPI TARGETS (Mục tiêu doanh thu theo nhân viên từng tháng)
-- ============================================================
CREATE TABLE IF NOT EXISTS public.kpi_targets (
  id            UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  employee_id   UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  period        TEXT NOT NULL,
  target_amount BIGINT NOT NULL DEFAULT 0,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (employee_id, period)
);

CREATE INDEX idx_kpi_employee_period ON public.kpi_targets(employee_id, period);

ALTER TABLE public.kpi_targets ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated can view KPI" ON public.kpi_targets
  FOR SELECT USING (auth.role() = 'authenticated');

CREATE POLICY "Admin can manage KPI" ON public.kpi_targets
  FOR ALL USING (
    EXISTS (SELECT 1 FROM public.users WHERE id = auth.uid() AND role = 'admin')
  );

-- ============================================================
-- 7. PERIOD LOCKS (Chốt sổ tháng)
-- ============================================================
CREATE TABLE IF NOT EXISTS public.period_locks (
  id         UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  period     TEXT NOT NULL UNIQUE,
  locked_by  UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  locked_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  note       TEXT
);

ALTER TABLE public.period_locks ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated can view locks" ON public.period_locks
  FOR SELECT USING (auth.role() = 'authenticated');

CREATE POLICY "Admin can manage locks" ON public.period_locks
  FOR ALL USING (
    EXISTS (SELECT 1 FROM public.users WHERE id = auth.uid() AND role = 'admin')
  );

-- ============================================================
-- 8. CHAT SESSIONS (Phiên chat của chatbot)
-- ============================================================
CREATE TABLE IF NOT EXISTS public.chat_sessions (
  id         UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id    UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  title      TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_chat_sessions_user ON public.chat_sessions(user_id);

ALTER TABLE public.chat_sessions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can manage own sessions" ON public.chat_sessions
  FOR ALL USING (user_id = auth.uid());

-- ============================================================
-- 9. CHAT MESSAGES (Tin nhắn trong phiên chat)
-- ============================================================
CREATE TABLE IF NOT EXISTS public.chat_messages (
  id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  session_id  UUID NOT NULL REFERENCES public.chat_sessions(id) ON DELETE CASCADE,
  role        TEXT NOT NULL CHECK (role IN ('user', 'assistant')),
  content     TEXT NOT NULL,
  tokens_used INTEGER,                             -- Số token đã dùng (để theo dõi chi phí Claude API)
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_chat_messages_session ON public.chat_messages(session_id);

ALTER TABLE public.chat_messages ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can manage messages in own sessions" ON public.chat_messages
  FOR ALL USING (
    EXISTS (
      SELECT 1 FROM public.chat_sessions cs
      WHERE cs.id = session_id AND cs.user_id = auth.uid()
    )
  );

-- ============================================================
-- TRIGGERS: auto-update updated_at
-- ============================================================
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'users_updated_at') THEN
    CREATE TRIGGER users_updated_at BEFORE UPDATE ON public.users
      FOR EACH ROW EXECUTE PROCEDURE update_updated_at_column();
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'channel_tags_updated_at') THEN
    CREATE TRIGGER channel_tags_updated_at BEFORE UPDATE ON public.channel_tags
      FOR EACH ROW EXECUTE PROCEDURE update_updated_at_column();
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'revenue_imports_updated_at') THEN
    CREATE TRIGGER revenue_imports_updated_at BEFORE UPDATE ON public.revenue_imports
      FOR EACH ROW EXECUTE PROCEDURE update_updated_at_column();
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'kpi_targets_updated_at') THEN
    CREATE TRIGGER kpi_targets_updated_at BEFORE UPDATE ON public.kpi_targets
      FOR EACH ROW EXECUTE PROCEDURE update_updated_at_column();
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'chat_sessions_updated_at') THEN
    CREATE TRIGGER chat_sessions_updated_at BEFORE UPDATE ON public.chat_sessions
      FOR EACH ROW EXECUTE PROCEDURE update_updated_at_column();
  END IF;
END;
$$;

-- ============================================================
-- TRIGGER: auto-create user profile on auth signup
-- ============================================================
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.users (id, email, full_name, avatar_url)
  VALUES (
    NEW.id,
    NEW.email,
    NEW.raw_user_meta_data->>'full_name',
    NEW.raw_user_meta_data->>'avatar_url'
  )
  ON CONFLICT (id) DO NOTHING;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'on_auth_user_created') THEN
    CREATE TRIGGER on_auth_user_created
      AFTER INSERT ON auth.users
      FOR EACH ROW EXECUTE PROCEDURE public.handle_new_user();
  END IF;
END;
$$;

-- ============================================================
-- DONE! Schema đã sẵn sàng.
-- Chạy tiếp 002_seed_data.sql để seed 27 tag kênh.
-- ============================================================
SELECT 'Schema V1 created successfully! Tables: users, channel_tags, revenue_imports, orders, orders_excluded, kpi_targets, period_locks, chat_sessions, chat_messages' AS result;
