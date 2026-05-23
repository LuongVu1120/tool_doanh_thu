-- Enable UUID generation
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ============================================================
-- USERS
-- ============================================================
CREATE TABLE IF NOT EXISTS public.users (
  id          UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  email       TEXT NOT NULL UNIQUE,
  full_name   TEXT,
  avatar_url  TEXT,
  role        TEXT NOT NULL DEFAULT 'viewer' CHECK (role IN ('admin', 'media', 'viewer')),
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE public.users ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view all profiles" ON public.users
  FOR SELECT USING (true);

CREATE POLICY "Users can update own profile" ON public.users
  FOR UPDATE USING (auth.uid() = id);

CREATE POLICY "Users can insert own profile" ON public.users
  FOR INSERT WITH CHECK (auth.uid() = id);

-- ============================================================
-- MAPPING IMPORTS  (versioned — each upload creates one row)
-- ============================================================
CREATE TABLE IF NOT EXISTS public.mapping_imports (
  id               UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  uploaded_by      UUID REFERENCES public.users(id) ON DELETE SET NULL,
  file_name        TEXT,
  total_rows       INT NOT NULL DEFAULT 0,
  total_employees  INT NOT NULL DEFAULT 0,
  total_channels   INT NOT NULL DEFAULT 0,
  unassigned_count INT NOT NULL DEFAULT 0,
  active_from      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  active_to        TIMESTAMPTZ,   -- NULL = currently active version
  notes            TEXT,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_mapping_imports_active ON public.mapping_imports(active_to);

ALTER TABLE public.mapping_imports ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated can view mapping imports" ON public.mapping_imports
  FOR SELECT USING (auth.role() = 'authenticated');

CREATE POLICY "Admin and media can manage mapping imports" ON public.mapping_imports
  FOR ALL USING (
    EXISTS (
      SELECT 1 FROM public.users
      WHERE id = auth.uid() AND role IN ('admin', 'media')
    )
  );

-- ============================================================
-- CHANNEL TAGS  (linked to mapping_import — NOT standalone)
-- ============================================================
CREATE TABLE IF NOT EXISTS public.channel_tags (
  id                    BIGSERIAL PRIMARY KEY,
  mapping_import_id     UUID NOT NULL REFERENCES public.mapping_imports(id) ON DELETE CASCADE,
  tag_name_normalized   TEXT NOT NULL,
  tag_name_original     TEXT NOT NULL,
  channel_display       TEXT,
  employee_name         TEXT,
  employee_id           UUID REFERENCES public.users(id) ON DELETE SET NULL,
  created_at            TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_channel_tags_normalized_import
  ON public.channel_tags(tag_name_normalized, mapping_import_id);

ALTER TABLE public.channel_tags ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated can view channel tags" ON public.channel_tags
  FOR SELECT USING (auth.role() = 'authenticated');

CREATE POLICY "Admin and media can manage channel tags" ON public.channel_tags
  FOR ALL USING (
    EXISTS (
      SELECT 1 FROM public.users
      WHERE id = auth.uid() AND role IN ('admin', 'media')
    )
  );

-- ============================================================
-- ORDERS  (UPSERT model — stores all orders regardless of status)
-- ============================================================
CREATE TABLE IF NOT EXISTS public.orders (
  order_code          TEXT PRIMARY KEY,
  source              TEXT,
  status              TEXT,   -- "Đã hoàn thành", "Đang giao dịch", "Đã hủy", etc.
  channel_tag_matched TEXT,
  employee_name       TEXT,
  employee_id         UUID REFERENCES public.users(id) ON DELETE SET NULL,
  completion_date     TIMESTAMPTZ,
  order_date          TIMESTAMPTZ,
  total_amount        BIGINT NOT NULL DEFAULT 0,
  raw_tags            TEXT,
  notes               TEXT,
  is_returned         BOOLEAN NOT NULL DEFAULT FALSE,
  return_code         TEXT,
  return_amount       BIGINT,
  return_date         TIMESTAMPTZ,
  first_imported_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  last_updated_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  period_locked       BOOLEAN NOT NULL DEFAULT FALSE
);

CREATE INDEX idx_orders_employee_date    ON public.orders(employee_id, completion_date);
CREATE INDEX idx_orders_status          ON public.orders(status);
CREATE INDEX idx_orders_is_returned     ON public.orders(is_returned);
CREATE INDEX idx_orders_completion_date ON public.orders(completion_date);

ALTER TABLE public.orders ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated can view orders" ON public.orders
  FOR SELECT USING (auth.role() = 'authenticated');

CREATE POLICY "Service role can manage orders" ON public.orders
  FOR ALL USING (auth.role() = 'service_role');

CREATE POLICY "Authenticated can upsert orders" ON public.orders
  FOR INSERT WITH CHECK (auth.role() = 'authenticated');

CREATE POLICY "Authenticated can update orders" ON public.orders
  FOR UPDATE USING (auth.role() = 'authenticated');

-- ============================================================
-- REVENUE IMPORTS  (log of each order file upload)
-- ============================================================
CREATE TABLE IF NOT EXISTS public.revenue_imports (
  id                      UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  uploaded_by             UUID REFERENCES public.users(id) ON DELETE SET NULL,
  file_name               TEXT,
  file_type               TEXT CHECK (file_type IN ('orders', 'mapping', 'returns')),
  total_rows_in_file      INT NOT NULL DEFAULT 0,
  total_orders_processed  INT NOT NULL DEFAULT 0,
  orders_upserted         INT NOT NULL DEFAULT 0,
  orders_new              INT NOT NULL DEFAULT 0,
  orders_status_changed   INT NOT NULL DEFAULT 0,
  status                  TEXT NOT NULL DEFAULT 'done'
                            CHECK (status IN ('processing', 'done', 'error')),
  error_message           TEXT,
  created_at              TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_revenue_imports_user    ON public.revenue_imports(uploaded_by);
CREATE INDEX idx_revenue_imports_status  ON public.revenue_imports(status);

ALTER TABLE public.revenue_imports ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own imports" ON public.revenue_imports
  FOR SELECT USING (
    uploaded_by = auth.uid() OR
    EXISTS (SELECT 1 FROM public.users WHERE id = auth.uid() AND role = 'admin')
  );

CREATE POLICY "Users can create imports" ON public.revenue_imports
  FOR INSERT WITH CHECK (auth.role() = 'authenticated');

-- ============================================================
-- RETURN IMPORTS  (log of each returns file upload)
-- ============================================================
CREATE TABLE IF NOT EXISTS public.return_imports (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  uploaded_by     UUID REFERENCES public.users(id) ON DELETE SET NULL,
  file_name       TEXT,
  total_returns   INT NOT NULL DEFAULT 0,
  matched_count   INT NOT NULL DEFAULT 0,
  unmatched_count INT NOT NULL DEFAULT 0,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE public.return_imports ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated can view return imports" ON public.return_imports
  FOR SELECT USING (auth.role() = 'authenticated');

CREATE POLICY "Authenticated can create return imports" ON public.return_imports
  FOR INSERT WITH CHECK (auth.role() = 'authenticated');

CREATE POLICY "Authenticated can update return imports" ON public.return_imports
  FOR UPDATE USING (auth.role() = 'authenticated');

-- ============================================================
-- RETURNS  (individual return orders)
-- ============================================================
CREATE TABLE IF NOT EXISTS public.returns (
  return_code          TEXT PRIMARY KEY,
  return_import_id     UUID REFERENCES public.return_imports(id) ON DELETE SET NULL,
  original_order_code  TEXT,
  return_amount        BIGINT NOT NULL DEFAULT 0,
  return_reason        TEXT,
  return_date          TIMESTAMPTZ,
  matched              BOOLEAN NOT NULL DEFAULT FALSE,
  created_at           TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_returns_original_order ON public.returns(original_order_code);
CREATE INDEX idx_returns_matched        ON public.returns(matched);

ALTER TABLE public.returns ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated can view returns" ON public.returns
  FOR SELECT USING (auth.role() = 'authenticated');

CREATE POLICY "Authenticated can manage returns" ON public.returns
  FOR ALL USING (auth.role() = 'authenticated');

-- ============================================================
-- KPI TARGETS
-- ============================================================
CREATE TABLE IF NOT EXISTS public.kpi_targets (
  id            BIGSERIAL PRIMARY KEY,
  employee_id   UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  period        TEXT NOT NULL,
  target_amount BIGINT NOT NULL DEFAULT 0,
  created_by    UUID REFERENCES public.users(id) ON DELETE SET NULL,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (employee_id, period)
);

CREATE INDEX idx_kpi_employee_period ON public.kpi_targets(employee_id, period);

ALTER TABLE public.kpi_targets ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own KPI" ON public.kpi_targets
  FOR SELECT USING (
    employee_id = auth.uid() OR
    EXISTS (SELECT 1 FROM public.users WHERE id = auth.uid() AND role IN ('admin', 'media'))
  );

CREATE POLICY "Admins can manage KPI" ON public.kpi_targets
  FOR ALL USING (
    EXISTS (SELECT 1 FROM public.users WHERE id = auth.uid() AND role = 'admin')
  );

-- ============================================================
-- PERIOD LOCKS
-- ============================================================
CREATE TABLE IF NOT EXISTS public.period_locks (
  period     TEXT PRIMARY KEY,
  locked_by  UUID REFERENCES public.users(id) ON DELETE SET NULL,
  locked_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  notes      TEXT
);

ALTER TABLE public.period_locks ENABLE ROW LEVEL SECURITY;

CREATE POLICY "All authenticated can view locks" ON public.period_locks
  FOR SELECT USING (auth.role() = 'authenticated');

CREATE POLICY "Admins can manage locks" ON public.period_locks
  FOR ALL USING (
    EXISTS (SELECT 1 FROM public.users WHERE id = auth.uid() AND role = 'admin')
  );

-- ============================================================
-- CHAT SESSIONS
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
-- CHAT MESSAGES
-- ============================================================
CREATE TABLE IF NOT EXISTS public.chat_messages (
  id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  session_id  UUID NOT NULL REFERENCES public.chat_sessions(id) ON DELETE CASCADE,
  role        TEXT NOT NULL CHECK (role IN ('user', 'assistant')),
  content     TEXT NOT NULL,
  tokens_used INT,
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

CREATE TRIGGER users_updated_at
  BEFORE UPDATE ON public.users
  FOR EACH ROW EXECUTE PROCEDURE update_updated_at_column();

CREATE TRIGGER kpi_targets_updated_at
  BEFORE UPDATE ON public.kpi_targets
  FOR EACH ROW EXECUTE PROCEDURE update_updated_at_column();

CREATE TRIGGER chat_sessions_updated_at
  BEFORE UPDATE ON public.chat_sessions
  FOR EACH ROW EXECUTE PROCEDURE update_updated_at_column();

-- ============================================================
-- FUNCTION: auto-create user profile on auth signup
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

CREATE OR REPLACE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE PROCEDURE public.handle_new_user();
