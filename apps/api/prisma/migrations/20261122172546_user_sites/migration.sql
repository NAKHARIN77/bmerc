-- site_managers becomes user_sites: the same site links now also scope stock keepers.
-- Renamed in place so rows and RLS policies (tenant_isolation, platform_read) carry over.
ALTER TABLE "site_managers" RENAME TO "user_sites";
ALTER TABLE "user_sites" RENAME CONSTRAINT "site_managers_pkey" TO "user_sites_pkey";
ALTER TABLE "user_sites" RENAME CONSTRAINT "site_managers_user_id_fkey" TO "user_sites_user_id_fkey";
ALTER TABLE "user_sites" RENAME CONSTRAINT "site_managers_site_id_fkey" TO "user_sites_site_id_fkey";
ALTER INDEX "site_managers_company_id_idx" RENAME TO "user_sites_company_id_idx";
ALTER INDEX "site_managers_site_id_idx" RENAME TO "user_sites_site_id_idx";
