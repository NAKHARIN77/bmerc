-- Sites are repair-center branches; customers ship devices in (design doc Q1, decided 2026-11-22).
-- DropForeignKey
ALTER TABLE "sites" DROP CONSTRAINT "sites_customer_id_fkey";

-- AlterTable
ALTER TABLE "sites" DROP COLUMN "customer_id";
