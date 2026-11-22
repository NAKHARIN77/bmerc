# BMERC

SaaS for Bitcoin mining-rig repair centers. Design: `docs/system-design.html`.
UI reference: the clickable prototype (latest) at https://claude.ai/artifact/KXW1n3EyWBb7i5hJEJ67dv

## Layout

- `apps/api` — NestJS 12 API (`/api/v1`), Prisma 7 schema and migrations in `apps/api/prisma`
- `apps/web` — Next.js 16 (admin, platform owner, technician PWA)
- `packages/shared` — types shared by api and web
- `docker/postgres-init` — dev-only DB bootstrap (creates the `bmerc_app` login role)

## Local setup

Needs Node 22+, Docker Desktop (virtualization enabled in BIOS).

```sh
cp .env.example apps/api/.env
npm install
npm run db:up          # PostgreSQL 16 in Docker
npm run db:migrate     # apply migrations (runs as table owner)
npm run dev:api        # http://localhost:4000/api/v1/health
npm run db:seed        # demo data; every demo account uses Demo1234!
npm run dev:web        # http://localhost:3000
npm run test:e2e -w @bmerc/api
```

Demo logins: `admin@siamhash.demo` (company admin), `manager@siamhash.demo` (site manager, Chonburi),
`head@siamhash.demo`, `tech@siamhash.demo`, `stock@siamhash.demo`, `owner@bmerc.demo` (platform owner).
Invite and password-reset emails are written to the API log until a mail provider is set up.

## Web ↔ API

The browser only talks to the web origin. `apps/web/next.config.ts` forwards `/api/v1/*` to the API
(`API_ORIGIN`, default `http://localhost:4000`; set it at build time for other environments), so the
API's httpOnly cookies are first-party. The API trusts `X-Forwarded-For` from `TRUST_PROXY`
(default `loopback`) so rate limits and audit logs see the real client IP. The UI is English only.

## Tenant isolation

Two layers (design doc section 3):

1. The API connects as `bmerc_app`, which does not own the tables, so PostgreSQL Row-Level
   Security always applies. Migrations use the owner via `MIGRATE_DATABASE_URL`.
2. Tenant queries go through `forTenant(prisma, companyId)` (`apps/api/src/prisma/tenant.ts`),
   which sets `app.company_id` per transaction. `companyId` comes from the JWT only.

`test/rls.e2e-spec.ts` checks that one company can never read or write another's data.
Production: create a LOGIN user for `bmerc_app` with a strong password outside migrations.
