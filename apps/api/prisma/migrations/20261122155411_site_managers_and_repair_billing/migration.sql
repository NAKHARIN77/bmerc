-- CreateEnum
CREATE TYPE "JobInvoiceStatus" AS ENUM ('unpaid', 'partial', 'paid', 'void');

-- CreateEnum
CREATE TYPE "JobInvoiceLineKind" AS ENUM ('labor', 'part', 'other');

-- CreateEnum
CREATE TYPE "PaymentMethod" AS ENUM ('bank_transfer', 'cash', 'other');

-- CreateEnum
CREATE TYPE "PaymentStatus" AS ENUM ('pending', 'confirmed', 'rejected');

-- AlterEnum
ALTER TYPE "Role" ADD VALUE 'site_manager';

-- AlterTable
ALTER TABLE "invoices" ADD COLUMN     "confirmed_by_id" UUID,
ADD COLUMN     "slip_uploaded_at" TIMESTAMP(3),
ADD COLUMN     "slip_url" TEXT;

-- CreateTable
CREATE TABLE "site_managers" (
    "company_id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "site_id" UUID NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "site_managers_pkey" PRIMARY KEY ("user_id","site_id")
);

-- CreateTable
CREATE TABLE "job_invoices" (
    "id" UUID NOT NULL,
    "company_id" UUID NOT NULL,
    "job_id" UUID NOT NULL,
    "number" TEXT NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'THB',
    "subtotal_cents" INTEGER NOT NULL,
    "tax_cents" INTEGER NOT NULL DEFAULT 0,
    "total_cents" INTEGER NOT NULL,
    "paid_cents" INTEGER NOT NULL DEFAULT 0,
    "status" "JobInvoiceStatus" NOT NULL DEFAULT 'unpaid',
    "issued_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "due_at" TIMESTAMP(3),
    "note" TEXT,
    "created_by_id" UUID,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "job_invoices_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "job_invoice_lines" (
    "id" UUID NOT NULL,
    "company_id" UUID NOT NULL,
    "invoice_id" UUID NOT NULL,
    "kind" "JobInvoiceLineKind" NOT NULL,
    "description" TEXT NOT NULL,
    "qty" DECIMAL(10,2) NOT NULL DEFAULT 1,
    "unit_price_cents" INTEGER NOT NULL,
    "amount_cents" INTEGER NOT NULL,
    "job_part_id" UUID,
    "sort_order" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "job_invoice_lines_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "job_payments" (
    "id" UUID NOT NULL,
    "company_id" UUID NOT NULL,
    "invoice_id" UUID NOT NULL,
    "method" "PaymentMethod" NOT NULL DEFAULT 'bank_transfer',
    "amount_cents" INTEGER NOT NULL,
    "paid_at" TIMESTAMP(3) NOT NULL,
    "reference" TEXT,
    "slip_url" TEXT,
    "status" "PaymentStatus" NOT NULL DEFAULT 'pending',
    "submitted_by_id" UUID,
    "reviewed_by_id" UUID,
    "reviewed_at" TIMESTAMP(3),
    "reject_reason" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "job_payments_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "site_managers_company_id_idx" ON "site_managers"("company_id");

-- CreateIndex
CREATE INDEX "site_managers_site_id_idx" ON "site_managers"("site_id");

-- CreateIndex
CREATE UNIQUE INDEX "job_invoices_job_id_key" ON "job_invoices"("job_id");

-- CreateIndex
CREATE INDEX "job_invoices_company_id_status_idx" ON "job_invoices"("company_id", "status");

-- CreateIndex
CREATE UNIQUE INDEX "job_invoices_company_id_number_key" ON "job_invoices"("company_id", "number");

-- CreateIndex
CREATE INDEX "job_invoice_lines_invoice_id_idx" ON "job_invoice_lines"("invoice_id");

-- CreateIndex
CREATE INDEX "job_payments_invoice_id_idx" ON "job_payments"("invoice_id");

-- AddForeignKey
ALTER TABLE "site_managers" ADD CONSTRAINT "site_managers_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "site_managers" ADD CONSTRAINT "site_managers_site_id_fkey" FOREIGN KEY ("site_id") REFERENCES "sites"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "job_invoices" ADD CONSTRAINT "job_invoices_job_id_fkey" FOREIGN KEY ("job_id") REFERENCES "jobs"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "job_invoice_lines" ADD CONSTRAINT "job_invoice_lines_invoice_id_fkey" FOREIGN KEY ("invoice_id") REFERENCES "job_invoices"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "job_payments" ADD CONSTRAINT "job_payments_invoice_id_fkey" FOREIGN KEY ("invoice_id") REFERENCES "job_invoices"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- ───── Hand-written: tenant isolation and integrity for the new tables ─────
DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['site_managers','job_invoices','job_invoice_lines','job_payments'] LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('ALTER TABLE %I FORCE ROW LEVEL SECURITY', t);
    EXECUTE format($p$CREATE POLICY tenant_isolation ON %I
      USING (company_id = NULLIF(current_setting('app.company_id', true), '')::uuid)
      WITH CHECK (company_id = NULLIF(current_setting('app.company_id', true), '')::uuid)$p$, t);
    EXECUTE format($p$CREATE POLICY platform_read ON %I FOR SELECT
      USING (current_setting('app.platform_admin', true) = 'on')$p$, t);
  END LOOP;
END $$;

ALTER TABLE job_invoices ADD CONSTRAINT job_invoices_amounts_valid
  CHECK (subtotal_cents >= 0 AND tax_cents >= 0 AND total_cents >= 0 AND paid_cents >= 0);
ALTER TABLE job_invoice_lines ADD CONSTRAINT job_invoice_lines_amounts_valid
  CHECK (qty > 0 AND unit_price_cents >= 0 AND amount_cents >= 0);
ALTER TABLE job_payments ADD CONSTRAINT job_payments_amount_positive CHECK (amount_cents > 0);
