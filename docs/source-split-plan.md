# Source Split Plan

This repo is moving from a single Next.js application to a monorepo with separate web, API, worker, and shared packages.

## Current Layout

```txt
apps/
  api/       Standalone backend runtime. New heavy API endpoints should land here first.
  worker/    Background jobs, scheduled work, and heavy file processing.
packages/
  shared/    Environment helpers, request/response contracts, validators, constants, shared types.
  db/        Server-only database clients and repositories.
src/         Existing Next.js web app and legacy API routes.
```

## Migration Rules

- Keep `src/app/api/*` routes working until the matching route exists in `apps/api`.
- Move business logic out of Next route handlers before moving the HTTP endpoint.
- Keep service role keys and database write logic out of frontend code.
- Put request/response schemas and shared types in `packages/shared`.
- Put Supabase admin clients and repository functions in `packages/db`.
- Put CPU-heavy or long-running work in `apps/worker`, not in Next route handlers.

## Suggested Route Migration Order

1. Health and internal diagnostics.
2. Revenue report and reconciliation routes.
3. Upload and import processing routes.
4. Adjustment import routes.
5. Admin/auth-sensitive routes.
6. Chat route, if it needs backend-level rate limiting or provider abstraction.

## Local Commands

```bash
npm run dev:web
npm run dev:api
npm run dev:worker
npm run type-check
npm run type-check:api
npm run type-check:worker
npm run type-check:packages
```

The web app still runs from the existing root Next.js setup. `apps/api` defaults to `http://localhost:4000`.
