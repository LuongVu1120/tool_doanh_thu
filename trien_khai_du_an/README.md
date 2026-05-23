# huyk-tools — Công cụ nội bộ V1

Hệ thống tool nội bộ cho công ty HuyK. V1 gồm 3 tool: **doanh thu Team Media**, **chatbot học tập**, và **layout tool hub** kiểu j2team.org để mở rộng dễ ở V2/V3.

Spec đầy đủ ở [`PRD-Cong-cu-noi-bo-V1.md`](./PRD-Cong-cu-noi-bo-V1.md). README này tập trung vào **cách triển khai** — đọc xong là code được.

---

## 📦 Stack

| Hạng mục | Tech |
|---|---|
| Frontend + Backend | Next.js 14 (App Router) + TypeScript |
| UI | TailwindCSS + shadcn/ui |
| Database | PostgreSQL (Supabase) |
| Auth | Supabase Auth |
| AI Chatbot | Anthropic Claude API |
| Charts | Recharts |
| Excel parse | SheetJS (`xlsx`) |
| Deploy | Vercel |

---

## ✅ Yêu cầu môi trường

- **Node.js 20+** ([nodejs.org](https://nodejs.org))
- **pnpm** (khuyến nghị, cài bằng `npm install -g pnpm`) hoặc npm
- Tài khoản **Supabase** (free tier đủ cho V1) — đăng ký tại [supabase.com](https://supabase.com)
- **Anthropic API key** — đăng ký tại [console.anthropic.com](https://console.anthropic.com)
- (Tuỳ chọn) **Supabase CLI** để chạy migration: `npm install -g supabase`

---

## 🚀 Quick start (10 phút)

```bash
# 1. Tạo project Next.js
pnpm create next-app@latest huyk-tools \
  --typescript --tailwind --app --src-dir --import-alias "@/*"
cd huyk-tools

# 2. Cài dependencies chính
pnpm add @supabase/supabase-js @supabase/ssr
pnpm add @anthropic-ai/sdk
pnpm add xlsx
pnpm add recharts
pnpm add lucide-react
pnpm add date-fns
pnpm add zod react-hook-form @hookform/resolvers
pnpm add -D @types/node

# 3. Setup shadcn/ui
pnpm dlx shadcn@latest init
pnpm dlx shadcn@latest add button card input label select \
  table tabs dialog dropdown-menu toast badge progress

# 4. Tạo .env.local
cp .env.example .env.local
# Mở .env.local và điền giá trị (xem mục "Biến môi trường" bên dưới)

# 5. Chạy migration DB (xem mục "Database setup")

# 6. Khởi động dev server
pnpm dev
# Mở http://localhost:3000
```

---

## 🔐 Biến môi trường

Tạo file `.env.local` ở root project với nội dung sau:

```bash
# Supabase
NEXT_PUBLIC_SUPABASE_URL=https://xxxxx.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=eyJhbGciOi...
SUPABASE_SERVICE_ROLE_KEY=eyJhbGciOi...  # KHÔNG commit, dùng cho server-side only

# Anthropic
ANTHROPIC_API_KEY=sk-ant-...

# App
NEXT_PUBLIC_APP_URL=http://localhost:3000
NEXT_PUBLIC_APP_NAME="HuyK Tools"
```

Lưu ý:
- Lấy 3 giá trị Supabase ở **Project Settings → API** sau khi tạo project
- `SUPABASE_SERVICE_ROLE_KEY` chỉ dùng ở server-side (API routes, server actions), KHÔNG expose ra client
- Tạo file `.env.example` (commit) để dev khác biết cần biến gì

---

## 🗂️ Cấu trúc project đề xuất

```
huyk-tools/
├── src/
│   ├── app/                          # Next.js App Router
│   │   ├── (auth)/                   # Auth pages (login, signup)
│   │   ├── (app)/                    # Pages cần đăng nhập
│   │   │   ├── page.tsx              # Tool hub (giống j2team.org)
│   │   │   ├── revenue/              # Tool 1
│   │   │   │   ├── page.tsx          # Dashboard cá nhân
│   │   │   │   ├── team/             # Dashboard tổng team
│   │   │   │   ├── upload/           # Upload Excel
│   │   │   │   ├── mapping/          # Wizard mapping 27 tag
│   │   │   │   └── review/           # Tab "Cần xem lại"
│   │   │   └── chat/                 # Tool 2 - Chatbot
│   │   ├── api/
│   │   │   ├── revenue/
│   │   │   │   ├── upload/route.ts
│   │   │   │   ├── confirm/route.ts
│   │   │   │   └── dashboard/route.ts
│   │   │   └── chat/route.ts
│   │   └── layout.tsx
│   ├── components/
│   │   ├── ui/                       # shadcn components
│   │   ├── layout/                   # Header, Sidebar, ToolCard
│   │   └── revenue/                  # Revenue-specific
│   ├── lib/
│   │   ├── supabase/                 # Client/server Supabase helpers
│   │   ├── sapo-parser/              # ⭐ Parser Excel + 4-step pipeline
│   │   │   ├── parse-excel.ts        # Đọc & dedupe
│   │   │   ├── filter-orders.ts      # Bước 1
│   │   │   ├── deduplicate.ts        # Bước 2
│   │   │   ├── exchange-detector.ts  # Bước 3 (regex đổi hàng)
│   │   │   ├── tag-mapper.ts         # Bước 4
│   │   │   └── index.ts              # Pipeline orchestrator
│   │   └── anthropic.ts              # Claude API client
│   ├── types/
│   │   ├── database.ts               # Generated từ Supabase
│   │   └── sapo.ts                   # SapoOrder, ParseResult, ...
│   └── middleware.ts                 # Auth check
├── supabase/
│   └── migrations/                   # SQL migrations
│       ├── 001_initial_schema.sql
│       └── 002_seed_tags.sql
├── samples/                          # Excel mẫu để test
│   └── order_export.xlsx
├── .env.example
├── .env.local                        # gitignore
└── README.md
```

⭐ **Module quan trọng nhất:** `src/lib/sapo-parser/` — đây là phần khó nhất, nên tách module rõ ràng, test kỹ.

---

## 🗄️ Database setup

### Cách 1 — Supabase CLI (khuyến nghị)

```bash
# Init Supabase trong project
supabase init

# Link với project online
supabase link --project-ref <project-ref>

# Tạo file migration
supabase migration new initial_schema

# Paste SQL từ PRD mục 5 vào file vừa tạo
# Sau đó push lên Supabase
supabase db push
```

### Cách 2 — SQL Editor (nhanh hơn nếu chưa quen CLI)

1. Vào Supabase Dashboard → SQL Editor
2. Copy toàn bộ schema từ [PRD mục 5](./PRD-Cong-cu-noi-bo-V1.md#5-database-schema-v1)
3. Paste vào editor, bấm Run

### Seed data ban đầu

Cần seed 27 tag kênh để wizard mapping có data sẵn:

```sql
INSERT INTO channel_tags (tag_name_original, tag_name_normalized, effective_from, employee_id) VALUES
  ('page_HuyK - Kim Hoàn', 'page_huyk-kim hoàn', '2026-01-01', NULL),
  ('page_HuyK - Mê kim hoàn', 'page_huyk-mê kim hoàn', '2026-01-01', NULL),
  ('tiktok_business_HuyK- Xưởng Vàng Bạc 2', 'tiktok_business_huyk-xưởng vàng bạc 2', '2026-01-01', NULL);
  -- ... 24 tag còn lại, xem phụ lục A của PRD
```

`employee_id = NULL` ban đầu, admin sẽ map sau qua wizard.

---

## 🏗️ 4 module ưu tiên xây trước

Theo thứ tự, mỗi module xong test được mới qua module sau:

### 1. Auth + Layout chính (tuần 1-2)

- Setup Supabase Auth (email/password + Google OAuth)
- Middleware redirect chưa login về `/login`
- Layout: header, sidebar collapsible, tool card grid
- Dark mode toggle (next-themes)

**Acceptance:** đăng nhập → thấy trang chủ có 2-3 card tool (placeholder), click vào không lỗi

### 2. Excel parser (tuần 3)

File `src/lib/sapo-parser/`. Đây là core của Tool 1, làm xong test bằng file `samples/order_export.xlsx`.

```typescript
// src/lib/sapo-parser/index.ts
import { parseExcel } from './parse-excel';
import { filterOrders } from './filter-orders';
import { deduplicateAgainstDB } from './deduplicate';
import { detectExchange } from './exchange-detector';
import { mapTagsToEmployees } from './tag-mapper';

export async function processRevenueFile(buffer: Buffer, period: string) {
  const raw = await parseExcel(buffer);          // Đọc + dedupe theo Mã đơn
  const filtered = filterOrders(raw, period);    // Bước 1
  const fresh = await deduplicateAgainstDB(filtered); // Bước 2
  const withExchange = detectExchange(fresh);    // Bước 3
  const final = await mapTagsToEmployees(withExchange); // Bước 4
  return final;
}
```

**Acceptance:** parse file mẫu trả về đúng ~2.135 đơn Media (xem benchmark phụ lục D của PRD)

### 3. UI Upload + Preview (tuần 3-4)

- Trang `/revenue/upload`
- Drag & drop file Excel
- Gọi parser, hiển thị 4 metric (tổng/trùng/đổi/sẽ tính)
- Tab "Cần xem lại" với danh sách đơn mơ hồ
- Confirm → lưu vào DB

**Mockup:** [PRD mockup 1](#) (xem trong file PRD)

### 4. Dashboard + Mapping wizard (tuần 4-5)

- Trang `/revenue` (cá nhân) + `/revenue/team` (tổng)
- Wizard `/revenue/mapping` cho 27 tag
- Chart bằng Recharts
- Export Excel

---

## 🧪 Test parser với file mẫu

Trước khi viết UI, verify parser hoạt động đúng với data thật. Có 2 file mẫu trong `samples/`:

- `order_export_filtered.xlsx` — file đã lọc status trên Sapo (9.354 dòng)
- `order_export_raw.xlsx` — file thô chưa lọc (12.914 dòng)

Parser phải xử lý được cả 2 file ra kết quả tương đương. Tạo script test:

```typescript
// scripts/test-parser.ts
import { readFileSync } from 'fs';
import { processRevenueFile } from '@/lib/sapo-parser';

for (const file of ['order_export_filtered.xlsx', 'order_export_raw.xlsx']) {
  const buffer = readFileSync(`./samples/${file}`);
  const result = await processRevenueFile(buffer, '2026-05');
  console.log(`\n=== ${file} ===`);
  console.log({
    totalRows: result.totalRows,
    uniqueOrders: result.uniqueOrders,
    mediaOrders: result.mediaOrders,
    excluded: result.excluded.length,
    needsReview: result.needsReview.length,
    totalRevenue: result.totalRevenue,
  });
}
```

Chạy: `pnpm tsx scripts/test-parser.ts`

**Số liệu kỳ vọng (đã verify):**

| Chỉ số | File đã lọc | File thô |
|---|---:|---:|
| Tổng dòng | 9.354 | 12.914 |
| Đơn unique | 4.642 | 6.519 |
| Đơn Media sau pipeline | ~2.135 | ~2.138 |
| Doanh thu Media | ~4,49 tỷ | ~4,49 tỷ |
| Đơn "đổi hàng" cần review | ~100 | ~120 |

Chênh lệch ~3 đơn giữa 2 file là do timing snapshot (file đã lọc xuất sớm hơn). Pipeline parser phải ra kết quả tương đương cho cả 2 file — đây là **acceptance test** cho module parser.

---

## 📜 Scripts npm

Thêm vào `package.json`:

```json
{
  "scripts": {
    "dev": "next dev",
    "build": "next build",
    "start": "next start",
    "lint": "next lint",
    "type-check": "tsc --noEmit",
    "test:parser": "tsx scripts/test-parser.ts",
    "db:types": "supabase gen types typescript --linked > src/types/database.ts",
    "db:reset": "supabase db reset",
    "db:push": "supabase db push"
  }
}
```

---

## 🌿 Workflow phát triển

- Branch chính: `main` (production)
- Feature branch: `feat/<tên-tính-năng>` ví dụ `feat/excel-parser`
- Fix branch: `fix/<bug>`
- Commit message tiếng Anh, ngắn gọn: `feat: add exchange order detector`
- PR cần ít nhất 1 review trước khi merge

---

## 🚢 Deploy lên Vercel

1. Push code lên GitHub
2. Vào [vercel.com](https://vercel.com) → New Project → Import repo
3. Set environment variables (giống `.env.local` nhưng dùng giá trị production của Supabase)
4. Deploy
5. Add custom domain (nếu có)

Vercel auto-deploy mỗi khi push lên `main`. Branch khác sẽ tạo preview URL.

---

## 📊 Theo dõi tiến độ V1 (7 tuần)

- [ ] Tuần 1: Setup, auth, design system
- [ ] Tuần 2: Layout chính, tool hub
- [ ] Tuần 3: Excel parser + UI upload
- [ ] Tuần 4: Đổi hàng + mapping wizard
- [ ] Tuần 5: Dashboard cá nhân + admin
- [ ] Tuần 6: Chatbot + polish
- [ ] Tuần 7: Deploy + training

---

## 📚 Đọc thêm

- **Spec đầy đủ:** [`PRD-Cong-cu-noi-bo-V1.md`](./PRD-Cong-cu-noi-bo-V1.md)
- **File Excel mẫu:** `samples/order_export.xlsx` (file kế toán đã lọc trên Sapo)
- **Supabase docs:** [supabase.com/docs](https://supabase.com/docs)
- **Next.js App Router:** [nextjs.org/docs/app](https://nextjs.org/docs/app)
- **shadcn/ui:** [ui.shadcn.com](https://ui.shadcn.com)
- **Anthropic API:** [docs.claude.com](https://docs.claude.com)

---

## ❓ Có vấn đề gì hỏi ai

- **Câu hỏi business / spec:** check PRD trước, không có thì hỏi PM/owner
- **File Excel format khác lạ:** kiểm tra cấu trúc cột vs phụ lục C của PRD
- **Sapo có cập nhật format Excel:** parser ở `src/lib/sapo-parser/` cần update, test lại với file mẫu mới

---

*README này cập nhật khi có thay đổi lớn về stack hoặc workflow. Spec/scope thay đổi → cập nhật PRD.*
