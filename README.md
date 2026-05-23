# HuyK Tools

Hệ thống công cụ nội bộ cho đội ngũ HuyK Jewelry — nền tảng video/ecommerce.

## Cài đặt

### 1. Cài dependencies

```bash
cd huyk-tools
pnpm install
# hoặc: npm install
```

### 2. Cấu hình môi trường

```bash
cp .env.example .env.local
```

Điền các giá trị vào `.env.local`:
- `NEXT_PUBLIC_SUPABASE_URL` — URL project Supabase
- `NEXT_PUBLIC_SUPABASE_ANON_KEY` — Anon key từ Supabase Dashboard
- `SUPABASE_SERVICE_ROLE_KEY` — Service role key (chỉ dùng server-side)
- `ANTHROPIC_API_KEY` — API key Anthropic (cho tính năng Chat)

### 3. Tạo database Supabase

Chạy migration trong Supabase SQL Editor:

```sql
-- Paste nội dung file: supabase/migrations/001_initial_schema.sql
```

Sau khi có users, chạy tiếp:
```sql
-- Paste nội dung file: supabase/migrations/002_seed_tags.sql
-- Cập nhật UUIDs thật và uncomment các INSERT statements
```

### 4. Cấu hình Authentication Supabase

Trong Supabase Dashboard → Authentication → Providers:
- Bật **Email** (email/password)
- Bật **Google** OAuth (cần Google Cloud Console credentials)

Trong Authentication → URL Configuration:
- Site URL: `http://localhost:3000` (dev) / URL production
- Redirect URLs: `http://localhost:3000/api/auth/callback`

### 5. Phân quyền user

Chạy trong Supabase SQL Editor:
```sql
-- Set admin
UPDATE public.users SET role = 'admin' WHERE email = 'admin@huyk.vn';

-- Set media team members
UPDATE public.users SET role = 'media' WHERE email = 'media@huyk.vn';
```

### 6. Chạy ứng dụng

```bash
pnpm dev
```

Truy cập: http://localhost:3000

## Cấu trúc dự án

```
src/
├── app/
│   ├── (auth)/          # Login, Signup pages
│   ├── (app)/           # Protected app pages (layout + tool pages)
│   └── api/             # API routes
├── components/
│   ├── layout/          # Header, Sidebar, ToolCard
│   └── revenue/         # Revenue tool components
├── lib/
│   ├── sapo-parser/     # Excel parsing pipeline (4 steps)
│   └── supabase/        # Supabase client helpers
└── types/               # TypeScript types
```

## Test parser

```bash
pnpm test:parser
```

Chạy unit tests cho toàn bộ sapo-parser pipeline (không cần browser).

## Công cụ

| Công cụ | Route | Mô tả |
|---------|-------|-------|
| Tool Hub | `/` | Trang chủ grid công cụ |
| Doanh thu Media | `/revenue` | Dashboard cá nhân + upload |
| Dashboard Team | `/revenue/team` | Xem doanh thu toàn đội |
| Upload Excel | `/revenue/upload` | Upload file Sapo |
| Quản lý Tag | `/revenue/mapping` | Map tag kênh với nhân viên |
| Chatbot AI | `/chat` | Trợ lý AI (Beta) |

## Pipeline xử lý Excel Sapo

**Bước 1 — Lọc:** Đọc Excel, bỏ 4 hàng tiêu đề, forward-fill mã đơn, lọc trạng thái/nguồn/tag/kỳ

**Bước 2 — Anti-duplicate:** Loại đơn đã có trong DB

**Bước 3 — Phát hiện đổi hàng:** Regex trên tag + ghi chú, phân loại:
- `exchange_no_extra` → loại trừ
- `exchange_with_extra` → giữ với số tiền bù
- `needs_review` → cần xem xét thủ công

**Bước 4 — Map tag:** Tìm nhân viên từ tag kênh qua bảng `channel_tags`

## Tech stack

- **Next.js 14** App Router + TypeScript
- **TailwindCSS** + shadcn/ui patterns
- **Supabase** Auth + PostgreSQL (RLS)
- **SheetJS (xlsx)** — parse Excel
- **Recharts** — biểu đồ doanh thu
- **date-fns** — xử lý ngày tháng tiếng Việt
