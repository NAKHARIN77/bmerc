-- Companies may add their own miner models (2026-11-26). The platform list stays shared (company_id NULL);
-- a company's own models are seen and changed only by that company.
ALTER TABLE "miner_models" ADD COLUMN "company_id" UUID;
ALTER TABLE "miner_models" ADD CONSTRAINT "miner_models_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "companies"("id") ON DELETE CASCADE ON UPDATE CASCADE;
CREATE INDEX "miner_models_company_id_idx" ON "miner_models"("company_id");

-- Names: unique within the shared list, and unique within each company. (Partial indexes: Prisma's schema
-- cannot express them, so schema.prisma has no @unique on name.)
DROP INDEX "miner_models_name_key";
CREATE UNIQUE INDEX "miner_models_shared_name_key" ON "miner_models"(lower("name")) WHERE "company_id" IS NULL;
CREATE UNIQUE INDEX "miner_models_company_name_key" ON "miner_models"("company_id", lower("name")) WHERE "company_id" IS NOT NULL;

ALTER TABLE "miner_models" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "miner_models" FORCE ROW LEVEL SECURITY;
-- Everyone reads the shared list; a company also reads its own models.
CREATE POLICY shared_or_own_read ON "miner_models" FOR SELECT
  USING ("company_id" IS NULL OR "company_id" = NULLIF(current_setting('app.company_id', true), '')::uuid);
-- A company changes only its own models.
CREATE POLICY tenant_isolation ON "miner_models"
  USING ("company_id" = NULLIF(current_setting('app.company_id', true), '')::uuid)
  WITH CHECK ("company_id" = NULLIF(current_setting('app.company_id', true), '')::uuid);
-- The shared list is changed only outside any company context (the platform owner's API).
CREATE POLICY shared_write ON "miner_models"
  USING ("company_id" IS NULL AND NULLIF(current_setting('app.company_id', true), '') IS NULL)
  WITH CHECK ("company_id" IS NULL AND NULLIF(current_setting('app.company_id', true), '') IS NULL);
