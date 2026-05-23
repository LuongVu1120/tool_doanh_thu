# PRD — Hệ thống công cụ nội bộ V1

**Version:** 1.0 (Draft) · **Ngày:** 22/05/2026 · **Trạng thái:** Đã thống nhất scope, chuẩn bị triển khai

---

## 1. Tổng quan

### 1.1 Mục tiêu

Xây dựng một website nội bộ chứa các công cụ phục vụ công ty sản xuất video/content thương mại điện tử. V1 tập trung 3 tool:

1. **Tính doanh thu Team Media theo ngày** — tự động hoá quy trình thủ công của kế toán, cho nhân viên biết doanh thu cá nhân để điều chỉnh kịp thời
2. **Chatbot hỗ trợ học tập** — wrap API LLM, giúp nhân viên hỏi đáp về content/kỹ thuật
3. **Hệ thống đăng nhập + layout tool hub** — bố cục lấy cảm hứng từ j2team.org, mở rộng dễ cho V2/V3

### 1.2 Phạm vi V1

**In scope:**
- 3 tool trên
- Auth (email/password + Google OAuth) — không phân role, mọi user thấy mọi tool
- **3 loại input file** upload được:
  - File đơn hàng Sapo (`chua_loc` hoặc `da_loc`)
  - File DANH SÁCH KÊNH MEDIA (mapping nhân viên ↔ kênh)
  - File đơn trả hàng (`order_return_export`)
- Database lưu lịch sử mọi đơn từ ngày đầu (cần cho đối chiếu đơn trả về sau)
- Dashboard responsive desktop + mobile
- Dark mode

**Out of scope (V2+):**
- Kết nối Sapo API trực tiếp
- Tính doanh thu cho Team KD
- RAG cho chatbot với tài liệu nội bộ
- Mobile app native

### 1.3 Tech stack đề xuất

| Hạng mục | Lựa chọn | Lý do |
|---|---|---|
| Frontend + Backend | Next.js 14 (App Router) | Full-stack 1 repo, tốc độ phát triển |
| UI | TailwindCSS + shadcn/ui | Component đẹp, không khoá vendor |
| Database | PostgreSQL qua Supabase | Auth + Storage + Realtime tích hợp |
| Auth | Supabase Auth | Email/password + Google OAuth sẵn |
| Chatbot | Claude API (Anthropic) | Tiếng Việt tốt, streaming |
| Chart | Recharts | Đơn giản, đủ cho dashboard |
| File parse | SheetJS (xlsx) hoặc pandas (nếu backend Python) | Chuẩn để đọc Excel Sapo |
| Deploy | Vercel + Supabase | Setup nhanh, scale tốt |

Nếu team dev quen Laravel/PHP có thể thay thế, logic xử lý không đổi.

---

## 2. Tool 1: Doanh thu Team Media (tool chính)

### 2.1 Bối cảnh

Hiện tại kế toán đang xử lý thủ công 4 bước mỗi tháng:
1. Xuất Excel từ Sapo theo "Ngày hoàn thành" của tháng
2. Lọc trạng thái "Đã hoàn thành" + loại đơn đã tính tháng trước
3. Xử lý đơn đổi hàng theo ghi chú (bỏ nếu không thu thêm, tính chênh lệch nếu có)
4. Phân bổ doanh thu theo tag kênh → nhân viên Media

Pain points: dễ sai khi check trùng (manual diff giữa các tháng), parsing ghi chú đổi hàng tốn thời gian, không có tracking realtime cho nhân viên.

### 2.2 Chiến lược triển khai 3 pha

| Pha | Phương thức input | Tần suất cập nhật | Khi nào |
|---|---|---|---|
| A (V1) | Kế toán upload Excel thủ công | Mỗi lần upload (mục tiêu 2-3 lần/ngày) | Tuần 3-6 |
| B (V1.5) | Auto-import file từ email/Google Drive | 15-30 phút/lần | Sau khi V1 ổn |
| C (V2) | Sapo API webhook | Realtime (vài giây) | Khi mua gói API Sapo |

Logic xử lý 4 bước giữ nguyên qua các pha, chỉ thay đổi nguồn input. Code Pha A đầu tư đúng thì Pha B chỉ thêm cron job, Pha C chỉ thêm webhook endpoint.

### 2.3 Cấu trúc file Excel Sapo (đã verified)

File xuất từ Sapo có 4 dòng header, sau đó là dòng tên cột, rồi data. Có **34 cột**, các cột quan trọng:

| Cột | Tên | Ghi chú |
|---|---|---|
| 1 | Mã đơn hàng | KEY. String. Forward-fill vì dòng product tiếp theo bỏ trống |
| 4 | Nguồn | "Facebook" / "Tiktok for Business" / "TikTokShop" / "POS" / "Shopee" / "Zalo" / ... |
| 6 | Trạng thái đơn hàng | Lọc "Đã hoàn thành" |
| 15 | Tổng tiền | Tổng đơn hàng (sau giảm giá, trước phí ship). Lặp lại trên mọi dòng cùng đơn |
| 16 | Ghi chú | Free-form text, dùng cho phát hiện đổi hàng |
| 17 | Tags | Comma-separated. Chứa tag kênh và tag operational |
| 24 | Ngày hoàn thành | Format `DD-MM-YYYY HH:MM`. Dùng cho lọc kỳ |

**Lưu ý quan trọng:** mỗi đơn có thể có **nhiều dòng** (1 sản phẩm = 1 dòng). Cột STT chỉ điền ở dòng đầu mỗi đơn. Bắt buộc dedupe theo `Mã đơn hàng` trước khi sum, nếu không doanh thu sẽ bị nhân lên.

Số liệu thực từ file mẫu (50 ngày, 01/04-21/05/2026): 9.354 dòng → 4.642 đơn unique → tỷ lệ ~2 dòng/đơn.

### 2.4 Pipeline xử lý (đã verify trên data thực)

Hệ thống nhận **3 loại input file**:

| File | Tần suất upload | Mục đích |
|---|---|---|
| `chua_loc.xlsx` / `da_loc.xlsx` (Sapo orders) | Hàng tháng | Cập nhật đơn mới + status đơn cũ |
| `DANH_SÁCH_CÁC_KÊNH_MEDIA.xlsx` (mapping) | Khi có thay đổi nhân sự | Map kênh → nhân viên Media |
| `order_return_export.xlsx` (returns) | Hàng tháng | Loại đơn trả khỏi doanh thu |

**Lần đầu triển khai:** Upload file `chua_loc` rộng (vd: 7-12 tháng) để seed DB. Sau đó hàng tháng chỉ upload file 1 tháng.

#### Bước 1: Đọc & lưu DB

```
1. Auto-detect header (Sapo gốc dòng 5, file đã xử lý dòng 1)
2. Forward-fill cột "Mã đơn hàng" (mỗi đơn nhiều dòng product)
3. Dedupe theo Mã đơn hàng
4. UPSERT vào bảng `orders`:
   - Nếu order_code đã có → update status (status có thể đổi từ "Đang giao" → "Đã hoàn thành" → "Đã hủy")
   - Nếu chưa có → insert mới
5. Lưu MỌI đơn (kể cả "Đang giao dịch", "Đã hủy") để có lịch sử đối chiếu
```

#### Bước 2: Áp 3 rule lọc khi tính doanh thu

Doanh thu được **query động** từ DB, không phải snapshot:

```sql
WHERE status = 'Đã hoàn thành'
  AND NOT (tags chứa 'Bán trực tiếp')
  AND source != 'POS'
  AND NOT is_returned  -- đơn bị trả → loại
```

#### Bước 3: Match channel tag → nhân viên qua DANH SÁCH

Logic match (fuzzy, đã verify 74.5% match rate):

```
1. Normalize tag và ID trong DANH SÁCH:
   - Lowercase
   - Bỏ dấu tiếng Việt (NFD + Mn filter)
   - Thay [_-/,] bằng space
   - Normalize multiple space → single
2. Cho mỗi tag trong đơn:
   - Direct match: normalized_tag == key trong lookup
   - Partial match: key ∈ normalized_tag OR ngược lại (len diff < 30)
3. Đơn không match: log vào tab "Tag chưa map" để admin update DANH SÁCH
```

**Format cột ID trong DANH SÁCH** có thể chứa nhiều ID/dòng, ngăn bằng `/`, `,`, hoặc `" và "`. Ví dụ:
```
page_id_2497800676910664 / page_HuyK - Kim Hoàn
huyk.mekimhoan/tiktok_business_HuyK Mê Kim Hoàn
zalo_oa_id_1774338085536601787 và 0966438662
```

#### Bước 4: Xử lý đơn trả hàng

```
1. Đọc file order_return_export.xlsx
2. Với mỗi đơn trả:
   - Match `Mã đơn hàng` (đơn gốc) với DB
   - Nếu match → đánh dấu đơn gốc `is_returned = TRUE`, kèm `return_amount`, `return_date`
   - Nếu không match (đơn gốc trước kỳ DB) → log vào tab "Đơn trả chưa match"
3. Doanh thu auto cập nhật: đơn `is_returned = TRUE` bị loại khỏi tính toán
4. Quy tắc: đơn trả → đơn gốc KHÔNG được tính doanh thu cho nhân viên (không tính là đơn đạt doanh thu)
```

**Lý do cần lưu DB lâu dài:** từ data test, chỉ 2/319 đơn trả tháng 4 match được nếu chỉ có file 1 tháng. Cần ≥3 tháng lịch sử để match được 90%+ đơn trả.

### 2.5 Mapping nhân viên ↔ kênh

Nguồn của mapping là file **DANH_SÁCH_CÁC_KÊNH_MEDIA.xlsx** do leader Media duy trì. File này:

- 71 dòng (1 dòng = 1 kênh) với 18 nhân viên Media hiện tại
- 3 cột: `TÊN`, `ID`, `Kênh`
- Một nhân viên có nhiều kênh: VÂN (10), LINH (9), NGA (7), ÁNH (6), HUY/HỒ ĐẠT (5)...
- 4 dòng có `TÊN` để trống = kênh chưa gán cho ai → cần admin update

**Cách quản lý mapping trong hệ thống:**

- **Upload file:** admin upload file DANH SÁCH bất cứ khi nào có thay đổi (thêm/sửa kênh, nhân viên nghỉ việc, v.v.)
- **Versioning:** lưu lịch sử các phiên bản mapping. Khi tính báo cáo cho tháng cũ, dùng mapping của tháng đó (không phải mapping hiện tại)
- **Auto-detect tag mới:** sau khi import đơn, hệ thống list các tag có giao dịch nhưng không match DANH SÁCH → admin update file DANH SÁCH rồi upload lại

Số liệu test trên file thực:
- File DANH SÁCH 71 dòng → 132 lookup keys (nhờ split ID theo `/`, `,`, `và`)
- Match được **74.5%** doanh thu (6.431 tỷ / 8.633 tỷ)
- Còn 5.4% chưa match — 3 nguyên nhân thường gặp:
  - Page mới chưa có trong DANH SÁCH (ví dụ `page_id_737724419414981`)
  - Tag Zalo format "Nguồn: ..." chưa được thêm
  - Tag viết hoa khác (`page_Huyk` vs `page_HuyK`) — đã handle bằng fuzzy

### 2.6 User flow (không phân role)

Mọi user login đều thấy và truy cập được mọi tính năng của tool doanh thu:

- **Upload Excel Sapo:** ai cũng có quyền upload file mới
- **Quản lý mapping tag → nhân viên:** ai cũng sửa được (nên có log lịch sử thay đổi để audit)
- **Dashboard cá nhân ("Doanh thu của tôi"):** auto filter theo `user_id` của người đang login, hiển thị doanh thu của chính họ + các tag họ phụ trách
- **Dashboard tổng team:** xem doanh thu toàn bộ nhân viên Media, top performer, biểu đồ trend
- **Chốt sổ tháng / export Excel:** ai cũng làm được

Các user không phải Media (ví dụ kế toán) login vào sẽ thấy "Dashboard cá nhân" rỗng (vì không có tag nào map về họ), nhưng vẫn dùng được các tính năng khác.

### 2.7 Edge cases & lưu ý

1. **Đơn có nhiều channel tag:** rất hiếm. V1 lấy tag đầu tiên match. Log warning để admin review.
2. **Đơn 0đ:** vẫn import nhưng không tính vào doanh thu. Có thể là sample/quà tặng.
3. **Đơn có giảm giá lớn:** Tổng tiền đã trừ giảm giá, không cần xử lý thêm.
4. **Đơn có phí ship:** không cộng vào doanh thu (Tổng tiền không bao gồm ship).
5. **Tag có format không đồng nhất:** ví dụ `tiktok_business_HuyK- A` (không space) vs `tiktok_business_HuyK - A` (có space). Parser phải normalize.
6. **Order code dạng số dài** (TikTokShop, ví dụ `583786402192786939`): treat as string, không parse number.
7. **Tháng/kỳ giao thoa:** đơn `Ngày hoàn thành` cuối tháng → tính cho tháng đó, bất kể ngày đặt.
8. **File thô vs file đã lọc:** parser xử lý được cả 2. Filter `status = "Đã hoàn thành"` là defensive, hoạt động đúng dù file đã pre-filter hay chưa.

### 2.8 Status tracking & re-processing (cải tiến so với quy trình tay)

Hạn chế lớn của quy trình thủ công hiện tại: nếu kế toán xuất Excel ngày 21/05, các đơn hoàn thành sau ngày đó sẽ **bị bỏ sót khỏi báo cáo tháng 5** dù chúng đã được đặt từ tháng 4-5. Tương tự, đơn bị huỷ sau khi đã tính doanh thu sẽ tạo sai lệch.

Hệ thống mới giải quyết bằng cách:

- **Lưu MỌI đơn vào DB** kèm Ngày đặt + Ngày hoàn thành + Status hiện tại (kể cả đơn `Đang giao dịch`, `Đã hủy`, etc.)
- **Doanh thu tháng X** được query động: `WHERE completion_date IN month X AND status = 'Đã hoàn thành' AND NOT is_locked` — số luôn cập nhật theo trạng thái mới nhất của từng đơn
- **Khi import file mới**, đơn đã có trong DB nhưng status đổi (ví dụ từ `Đang giao dịch` → `Đã hủy`) sẽ được **update**, không tạo bản ghi trùng
- **Đơn từng tính nhưng bị huỷ sau:** nếu kỳ chưa chốt → tự động trừ; nếu kỳ đã chốt → giữ nguyên báo cáo cũ, ghi nhận điều chỉnh ở kỳ hiện tại (để không phá báo cáo lương đã trả)
- **Re-process trigger:** mỗi lần admin upload file mới, hệ thống quét toàn bộ đơn trong DB còn `Đang giao dịch` và update status nếu có trong file mới

### 2.8 Phân biệt "Tạm tính" vs "Đã chốt"

UI hiển thị badge rõ:
- **Tạm tính** (badge xanh, có icon đồng hồ): kỳ chưa đóng, số có thể thay đổi
- **Đã chốt** (badge xám, có icon khoá): admin đã đóng kỳ, số cố định, dùng tính lương/thưởng

Mỗi cuối tháng admin bấm "Chốt sổ tháng X" → snapshot dữ liệu, lock không cho sửa.

---

## 3. Tool 2: Chatbot hỗ trợ học tập

### 3.1 V1 — Wrap Claude API

- UI chat đơn giản: list tin nhắn, input box, gửi tin nhắn streaming response
- Lưu lịch sử chat per user
- System prompt được tùy chỉnh cho ngữ cảnh content video / trang sức:

```
Bạn là trợ lý học tập cho nhân viên công ty sản xuất content video 
ngành trang sức. Hỗ trợ về kịch bản, kỹ thuật quay/dựng, marketing 
mạng xã hội, và kiến thức sản phẩm trang sức cơ bản. Trả lời ngắn 
gọn, cụ thể, ưu tiên ví dụ thực tế.
```

- Có nút "Chat mới" để bắt đầu hội thoại mới
- Sidebar list các session chat cũ

### 3.2 V2 — RAG với kiến thức nội bộ

Sau khi V1 ổn và công ty đã chuẩn hoá tài liệu nội bộ (SOP, brand guideline, case study), upgrade lên RAG:

- Upload PDF/DOC vào Supabase Storage
- Embed bằng `text-embedding-3-small` hoặc Cohere
- Lưu vector vào pgvector (Supabase có sẵn)
- Khi user hỏi → retrieve top-k đoạn liên quan → đưa vào context Claude

### 3.3 Chi phí dự kiến

V1 với ~30 nhân viên dùng vừa phải: 20-50 USD/tháng Claude API. V2 thêm ~5 USD/tháng embedding.

---

## 4. Tool 3: Auth + Layout chính

### 4.1 Auth flow

- Đăng ký bằng email/password hoặc Google OAuth
- V1 cho phép tự đăng ký, không gating theo domain (giả định nhân viên tự đăng ký với email công ty)
- Quên mật khẩu qua email
- Session 30 ngày, refresh token tự động
- (Tuỳ chọn) Thêm cơ chế invite link nếu muốn kiểm soát ai vào hệ thống

### 4.2 Layout chính (sau khi login)

Lấy cảm hứng từ j2team.org, gồm:

- **Header:** logo công ty (góc trái), search bar tools (giữa), avatar dropdown (góc phải) gồm Profile / Settings / Logout
- **Sidebar** (collapsible): danh sách tool đã favorited, link nhanh
- **Main area:** grid card các tool có thể truy cập (filter theo role)
- **Mỗi card tool:** icon, tên, mô tả ngắn 1-2 dòng, badge "New" / "Beta" nếu cần

### 4.3 Quyền truy cập tool

Mọi tool đều mở cho mọi user đã đăng nhập. Phân biệt giữa các user **chỉ ở mức data hiển thị**, không gating tính năng:

- Tool "Doanh thu cá nhân" tự động filter theo `user_id` của người đang login
- Tool "Dashboard team" hiển thị cùng dữ liệu cho mọi user
- Các tool chung (Chatbot, Upload, Mapping) dùng giống nhau cho mọi user

Khi mở rộng tool mới ở V2 (ví dụ tool nhân sự chỉ leader xem được), khi đó sẽ thêm cơ chế role. V1 giữ đơn giản.

---

## 5. Database schema (V1)

```sql
-- Users
users (
  id uuid primary key,
  email text unique not null,
  full_name text,
  -- V1 không phân role. Khi V2 cần phân quyền, thêm field 'role' với default 'user'
  department text default 'media',
  avatar_url text,
  active boolean default true,
  created_at timestamptz default now()
)

-- Channel tag mapping (versioned, import từ DANH SÁCH)
mapping_imports (
  id uuid primary key,
  uploaded_by uuid references users(id),
  file_name text,
  total_rows int,
  total_employees int,
  total_channels int,
  unassigned_count int,  -- số dòng TÊN = trống
  active_from timestamptz default now(),
  active_to timestamptz,  -- null = đang dùng
  notes text
)

channel_tags (
  id serial primary key,
  mapping_import_id uuid references mapping_imports(id),
  tag_name_normalized text not null,  -- normalize: lowercase, bỏ dấu, replace [_-/,] bằng space
  tag_name_original text not null,
  channel_display text,  -- e.g. "FB - HuyK - Kim Hoàn"
  employee_id uuid references users(id),  -- null nếu CHƯA GÁN
  source text  -- 'Facebook', 'TikTok', 'Zalo', 'Zalo OA', ...
)
create index on channel_tags(tag_name_normalized, mapping_import_id);

-- Orders (lưu MỌI đơn, kể cả status khác Đã hoàn thành)
orders (
  order_code text primary key,
  source text,
  status text,  -- "Đã hoàn thành", "Đang giao dịch", "Đã hủy", "Đặt hàng", "Đã lưu trữ"
  channel_tag_matched text,  -- normalized tag đã match được
  employee_id uuid references users(id),
  completion_date timestamptz,  -- có thể NULL nếu chưa hoàn thành
  order_date timestamptz,
  total_amount bigint,
  raw_tags text,
  notes text,
  
  -- Return tracking
  is_returned boolean default false,
  return_code text,  -- "HK59576-R1"
  return_amount bigint,
  return_date timestamptz,
  
  -- Audit
  first_imported_at timestamptz default now(),
  last_updated_at timestamptz default now(),
  period_locked boolean default false  -- true sau khi chốt sổ tháng
)
create index on orders(employee_id, completion_date);
create index on orders(status);
create index on orders(is_returned);

-- Returns (file order_return_export)
return_imports (
  id uuid primary key,
  uploaded_by uuid references users(id),
  file_name text,
  total_returns int,
  matched_count int,
  unmatched_count int,
  created_at timestamptz default now()
)

returns (
  return_code text primary key,
  return_import_id uuid references return_imports(id),
  original_order_code text,  -- KHÔNG là FK, vì đơn gốc có thể chưa có trong DB
  return_amount bigint,
  return_reason text,
  return_date timestamptz,
  matched boolean default false,  -- true nếu original_order_code có trong orders
  created_at timestamptz default now()
)
create index on returns(original_order_code);

-- Revenue imports (log mỗi lần upload)
revenue_imports (
  id uuid primary key,
  period text,  -- e.g. "2026-05"
  uploaded_by uuid references users(id),
  file_name text,
  file_url text,
  total_rows_in_file int,
  total_orders_in_file int,
  orders_imported int,
  orders_duplicated int,
  orders_excluded int,
  orders_needs_review int,
  total_revenue_recognized bigint,
  status text check (status in ('processing', 'preview', 'confirmed', 'error')),
  error_message text,
  created_at timestamptz default now()
)

-- Orders (bảng chính)
orders (
  order_code text primary key,
  import_id uuid references revenue_imports(id),
  source text,  -- "Facebook", "Tiktok for Business"
  channel_tag_normalized text,
  employee_id uuid references users(id),
  completion_date timestamptz not null,
  order_date timestamptz,
  original_amount bigint,    -- Tổng tiền gốc
  recognized_amount bigint,  -- Số tiền được tính doanh thu
  exchange_type text check (exchange_type in ('none', 'no_extra', 'with_extra', 'needs_review')),
  exchange_reference text,   -- mã đơn gốc nếu là đơn đổi
  notes text,
  raw_tags text,
  needs_review boolean default false,
  review_reason text,
  reviewed_by uuid references users(id),
  reviewed_at timestamptz,
  period text,  -- "2026-05", denormalized cho query nhanh
  is_locked boolean default false,  -- true sau khi chốt sổ
  created_at timestamptz default now()
)
create index on orders(employee_id, completion_date);
create index on orders(period);
create index on orders(channel_tag_normalized);

-- Excluded orders (audit log)
orders_excluded (
  id serial primary key,
  order_code text not null,
  import_id uuid references revenue_imports(id),
  reason text,  -- "duplicate", "not_media_source", "no_channel_tag", 
                -- "exchange_no_extra", "out_of_period", "needs_review"
  reason_detail text,
  raw_data jsonb,
  created_at timestamptz default now()
)

-- KPI targets
kpi_targets (
  id serial primary key,
  employee_id uuid references users(id),
  period text,  -- "2026-05"
  target_amount bigint,
  created_by uuid references users(id),
  created_at timestamptz default now(),
  unique (employee_id, period)
)

-- Period locks
period_locks (
  period text primary key,
  locked_by uuid references users(id),
  locked_at timestamptz,
  notes text
)

-- Chat sessions
chat_sessions (
  id uuid primary key,
  user_id uuid references users(id),
  title text,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
)

-- Chat messages
chat_messages (
  id uuid primary key,
  session_id uuid references chat_sessions(id) on delete cascade,
  role text check (role in ('user', 'assistant')),
  content text,
  tokens_used int,
  created_at timestamptz default now()
)
```

---

## 6. API endpoints (V1)

### Auth
- `POST /api/auth/signup` — chỉ với domain whitelist
- `POST /api/auth/login`
- `POST /api/auth/logout`
- `POST /api/auth/forgot-password`

### Revenue
- `POST /api/revenue/upload` — upload Excel, trả về import_id và preview
- `GET /api/revenue/import/:id/preview` — xem chi tiết kết quả parse
- `GET /api/revenue/import/:id/needs-review` — danh sách đơn cần review
- `POST /api/revenue/import/:id/resolve` — admin quyết case review
- `POST /api/revenue/import/:id/confirm` — chốt và lưu vào DB chính
- `GET /api/revenue/dashboard/me` — dashboard cá nhân
- `GET /api/revenue/dashboard/team` — dashboard admin (Media team)
- `GET /api/revenue/orders?employee_id=&period=` — list đơn
- `POST /api/revenue/period/:period/lock` — chốt sổ
- `GET /api/revenue/export?period=` — export Excel

### Mapping
- `GET /api/mapping/tags` — list 27 tag và mapping hiện tại
- `POST /api/mapping/tags/bulk` — bulk update từ wizard
- `POST /api/mapping/tags/import` — upload Excel mapping
- `GET /api/mapping/tags/:tag/sample-orders` — xem mẫu đơn

### KPI
- `GET /api/kpi/:employee_id/:period`
- `POST /api/kpi/:employee_id/:period` — set target

### Chatbot
- `GET /api/chat/sessions` — list session
- `POST /api/chat/sessions` — tạo session mới
- `POST /api/chat/sessions/:id/messages` — gửi tin nhắn, stream response
- `DELETE /api/chat/sessions/:id`

### Users
- `GET /api/users` — list nhân viên Media (để hiển thị dropdown mapping)
- `PATCH /api/users/me` — cập nhật profile cá nhân

---

## 7. Roadmap 7 tuần

| Tuần | Mục tiêu | Deliverable |
|---|---|---|
| 1 | Setup & Foundation | Repo, auth, design system, schema DB, demo login |
| 2 | Layout chính | Landing page (grid card), header, sidebar, profile, dark mode |
| 3 | Doanh thu — Parser & Upload | Parse Excel Sapo, dedupe, bước 1-2, UI upload + preview |
| 4 | Doanh thu — Đổi hàng & Mapping | Regex đổi hàng, wizard mapping 27 tag, UI "Cần xem lại" |
| 5 | Doanh thu — Dashboard | Dashboard cá nhân + admin, biểu đồ, export Excel, KPI |
| 6 | Chatbot + Polish | Chatbot wrap Claude API, polish toàn bộ, responsive, edge case |
| 7 | Deploy & Training | Production deploy, domain, training nhân viên, hướng dẫn |

Sau tuần 7, V1 đi vào sử dụng. Việc nâng cấp lên Pha B (auto-import) và Pha C (Sapo API) thực hiện sau khi V1 chạy ổn ~1-2 tháng.

---

## 8. Câu hỏi mở & việc cần làm

### 8.1 Cần xác nhận từ kế toán

- **🔴 QUAN TRỌNG — Cách lọc thực tế:** quy trình tài liệu nói lọc theo "Ngày hoàn thành", nhưng phân tích file mẫu cho thấy kế toán có thể đang lọc theo **"Ngày đặt hàng"** (đơn được đặt từ 01/04 đến 30/04, nhưng hoàn thành đến tận 22/05). Cần xác nhận rõ. Cả 2 cách đều có "vùng rò rỉ" giữa các tháng — hệ thống mới sẽ giải quyết vấn đề này (xem mục 2.7).
- File Excel hiện tại đang được lọc thủ công trên Sapo bằng cách nào? (Lọc status trước khi xuất, hay xuất rồi lọc trong Excel?) → **Trả lời từ phân tích:** file đã lọc và file thô có cấu trúc cột giống y hệt, parser xử lý được cả 2.
- Quy ước viết số tiền trong ghi chú có chuẩn nào không? Ví dụ `350k` vs `350.000` vs `350K`.

### 8.2 Cần input từ công ty

- Danh sách 32 nhân viên Media với email công ty
- Mapping 27 tag kênh → nhân viên cụ thể (làm trong wizard sau khi deploy)
- Brand guideline (logo, màu chính, font) — nếu chưa có thì dùng style mặc định
- KPI tháng cho từng nhân viên (nếu có)

### 8.3 Cần quyết định thương mại

- Có mua gói Sapo API không? Nếu có, khi nào? (Để lên kế hoạch Pha C)
- Budget cho Claude API hàng tháng (V1: ~50 USD, V2 RAG: ~80 USD)
- Hosting: dùng Vercel Free tier (đủ cho 32 user) hay Pro (20 USD/tháng)?

### 8.4 File thô chưa lọc

Bạn sẽ gửi 1 file Excel xuất trực tiếp từ Sapo chưa qua lọc tay. Khi có file đó, mình sẽ:
- So sánh cấu trúc với file đã lọc xem có khác cột không
- Verify logic lọc status hoạt động đúng
- Đo accuracy của regex đổi hàng trên tập rộng hơn

---

## 9. Phụ lục

### A. Danh sách 27 tag kênh hiện có

Sắp xếp theo số đơn giảm dần (data từ file mẫu 50 ngày):

| # | Tag | Nguồn | Đơn |
|---:|---|---|---:|
| 1 | tiktok_business_HuyK- Xưởng Vàng Bạc 2 | TikTok | 242 |
| 2 | page_HuyK - Kim Hoàn | FB | 223 |
| 3 | page_HuyK - Mê kim hoàn | FB | 222 |
| 4 | page_HuyK - Trang Sức Chế Tác | FB | 151 |
| 5 | page_HuyK Viễn Chí Bảo | FB | 150 |
| 6 | tiktok_business_HuyK - Kim Hoàn Viễn Chí Bảo | TikTok | 149 |
| 7 | page_HuyK - Trang sức thiết kế | FB | 138 |
| 8 | page_HuyK - Xưởng Vàng Bạc | FB | 122 |
| 9 | page_HuyK - Xưởng Chế Tác | FB | 120 |
| 10 | page_HuyK Thợ trang sức thủ công | FB | 110 |
| 11 | page_HuyK - Xưởng Kim Hoàn | FB | 92 |
| 12 | tiktok_business_HuyK - Trang Sức Chế Tác | TikTok | 71 |
| 13 | tiktok_business_HuyK-Viễn Chí Bảo | TikTok | 62 |
| 14 | page_HuyK Jewelry | FB | 47 |
| 15 | page_HuyK - Chế Tác Kim Hoàn | FB | 42 |
| 16 | tiktok_business_HuyK - Xưởng Vàng Bạc | TikTok | 41 |
| 17 | page_HuyK Jeweler | FB | 38 |
| 18 | page_HuyK Trang Sức Đá Quý | FB | 35 |
| 19 | page_HuyK Thợ Chế Tác | FB | 33 |
| 20 | page_HuyK Vàng Bạc Đá Quý | FB | 27 |
| 21 | tiktok_business_HuyK - Trang Sức Bạc Thái | TikTok | 12 |
| 22-27 | (6 tag với <10 đơn) | mixed | <10 mỗi tag |

### B. Regex patterns đề xuất

```javascript
// Phát hiện đơn đổi hàng
const EXCHANGE_DETECT = /đổi\s*(hàng|size|sản\s*phẩm)/i;

// Loại đơn (không thu thêm)
const NO_EXTRA = /không\s*thu|thu\s*0|thu\s*gì|0\s*đ/i;

// Trích số tiền chênh lệch
const EXTRA_AMOUNT = /(?:bù|thu|đã\s*thu)\s*(?:đủ\s*)?(\d+(?:[.,]\d+)*)\s*(k|tr|đ|nghìn|triệu)?/i;

// Hàm chuyển đổi số tiền: "1tr350k" → 1350000, "350k" → 350000, "2tr" → 2000000
function parseAmount(text) {
  // Implementation:
  // - tr/triệu = nhân 1,000,000
  // - k/nghìn = nhân 1,000
  // - đ = giữ nguyên
  // - tổ hợp: "1tr350k" = 1*1000000 + 350*1000
}
```

### C. Cấu trúc file Excel Sapo (34 cột)

Header row ở dòng 5. Các cột (1-indexed):

1. STT, 2. Mã đơn hàng, 3. Ngày đặt hàng, 4. Chi nhánh, 5. Nguồn, 6. Nhân viên tạo đơn, 7. Trạng thái đơn hàng, 8. Tên khách hàng, 9. Email, 10. Số điện thoại, 11. Tên sản phẩm, 12. Mã SKU, 13. Số lượng sản phẩm, 14. Giá sản phẩm, 15. Tổng số lượng sản phẩm, 16. Tổng tiền, 17. Ghi chú, 18. Tags, 19. Ngày tạo đơn, 20. Phí vận chuyển, 21. Khách còn phải trả, 22. Tiền hoàn trả, 23. Khách đã trả, 24. Nhân viên phụ trách, 25. Ngày hoàn thành, 26. Ngày thanh toán, 27. Trạng thái giao hàng, 28. Trạng thái xử lý, 29. Xử lý lúc, 30. Ngày giao hàng thành công, 31. Giảm giá trên sản phẩm, 32. Tổng tiền hàng, 33. Tên sản phẩm combo, 34. Mã sản phẩm combo

### D. Số liệu benchmark (verified trên 2 file mẫu)

**File đã lọc (do kế toán xuất sau khi filter status):**

| Chỉ số | Giá trị |
|---|---:|
| Tổng dòng file | 9.354 |
| Tổng đơn unique | 4.642 |
| Đơn Media (FB + TT có tag) | 2.135 (46%) |
| Doanh thu Media | ~4,49 tỷ VND |
| Đơn đổi hàng (có "đổi hàng" trong ghi chú) | 151 (3,3%) |
| Số tag kênh unique | 27 |

**File thô (xuất trực tiếp từ Sapo, chưa lọc):**

| Chỉ số | Giá trị |
|---|---:|
| Tổng dòng file | 12.914 |
| Tổng đơn unique | 6.519 |
| Đơn "Đã hoàn thành" | 4.646 |
| Đơn "Đang giao dịch" | 945 |
| Đơn "Đã hủy" | 767 |
| Đơn "Đặt hàng" | 120 |
| Đơn "Đã lưu trữ" | 41 |
| Đơn Media sau pipeline | 2.138 |
| Doanh thu Media | ~4,49 tỷ VND |

**Kết luận test:** cùng pipeline 4 bước xử lý cả 2 file ra kết quả tương đương (chênh 3 đơn = đơn hoàn thành sau thời điểm xuất file lọc). Parser dùng chung được, không phải code riêng cho 2 dạng input.

---

*Tài liệu này là draft ban đầu, có thể cập nhật khi nhận thêm input từ kế toán và file Excel thô. Mọi thay đổi nên được version control.*
