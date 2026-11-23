-- CreateEnum
CREATE TYPE "StockTransferStatus" AS ENUM ('in_transit', 'received', 'cancelled');

-- AlterTable
ALTER TABLE "invoices" ADD COLUMN     "plan_id" UUID;

-- CreateTable
CREATE TABLE "stock_transfers" (
    "id" UUID NOT NULL,
    "company_id" UUID NOT NULL,
    "from_site_id" UUID NOT NULL,
    "to_site_id" UUID NOT NULL,
    "part_id" UUID NOT NULL,
    "qty" INTEGER NOT NULL,
    "status" "StockTransferStatus" NOT NULL DEFAULT 'in_transit',
    "note" TEXT,
    "sent_by_id" UUID NOT NULL,
    "sent_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "closed_by_id" UUID,
    "closed_at" TIMESTAMP(3),

    CONSTRAINT "stock_transfers_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "stock_transfers_company_id_status_idx" ON "stock_transfers"("company_id", "status");

-- AddForeignKey
ALTER TABLE "invoices" ADD CONSTRAINT "invoices_plan_id_fkey" FOREIGN KEY ("plan_id") REFERENCES "plans"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "stock_transfers" ADD CONSTRAINT "stock_transfers_from_site_id_fkey" FOREIGN KEY ("from_site_id") REFERENCES "sites"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "stock_transfers" ADD CONSTRAINT "stock_transfers_to_site_id_fkey" FOREIGN KEY ("to_site_id") REFERENCES "sites"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "stock_transfers" ADD CONSTRAINT "stock_transfers_part_id_fkey" FOREIGN KEY ("part_id") REFERENCES "parts"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Stock transfers belong to one company: same tenant isolation and platform read as site_stock.
ALTER TABLE "stock_transfers" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "stock_transfers" FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "stock_transfers"
  USING (company_id = NULLIF(current_setting('app.company_id', true), '')::uuid)
  WITH CHECK (company_id = NULLIF(current_setting('app.company_id', true), '')::uuid);
CREATE POLICY platform_read ON "stock_transfers" FOR SELECT
  USING (current_setting('app.platform_admin', true) = 'on');
ALTER TABLE "stock_transfers" ADD CONSTRAINT "stock_transfers_qty_positive" CHECK (qty > 0);
ALTER TABLE "stock_transfers" ADD CONSTRAINT "stock_transfers_two_sites" CHECK (from_site_id <> to_site_id);
