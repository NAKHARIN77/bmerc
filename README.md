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
npm run dev:web        # http://localhost:3000
npm run test:e2e -w @bmerc/api
```

## Tenant isolation

Two layers (design doc section 3):

1. The API connects as `bmerc_app`, which does not own the tables, so PostgreSQL Row-Level
   Security always applies. Migrations use the owner via `MIGRATE_DATABASE_URL`.
2. Tenant queries go through `forTenant(prisma, companyId)` (`apps/api/src/prisma/tenant.ts`),
   which sets `app.company_id` per transaction. `companyId` comes from the JWT only.

`test/rls.e2e-spec.ts` checks that one company can never read or write another's data.
Production: create a LOGIN user for `bmerc_app` with a strong password outside migrations.
