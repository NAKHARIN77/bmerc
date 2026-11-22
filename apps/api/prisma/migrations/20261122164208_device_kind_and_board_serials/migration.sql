-- CreateEnum
CREATE TYPE "DeviceKind" AS ENUM ('miner', 'hashboard', 'control_board', 'psu', 'other');

-- DropIndex
DROP INDEX "devices_company_id_serial_no_key";

-- AlterTable
ALTER TABLE "devices" ADD COLUMN     "kind" "DeviceKind" NOT NULL DEFAULT 'miner';

-- AlterTable
ALTER TABLE "job_components" ADD COLUMN     "replacement_serial_no" TEXT,
ADD COLUMN     "serial_no" TEXT;

-- CreateIndex
CREATE INDEX "devices_company_id_serial_no_idx" ON "devices"("company_id", "serial_no");

-- CreateIndex
CREATE UNIQUE INDEX "devices_company_id_kind_serial_no_key" ON "devices"("company_id", "kind", "serial_no");

-- CreateIndex
CREATE INDEX "job_components_company_id_serial_no_idx" ON "job_components"("company_id", "serial_no");

-- CreateIndex
CREATE INDEX "job_components_company_id_replacement_serial_no_idx" ON "job_components"("company_id", "replacement_serial_no");

