-- AlterTable
ALTER TABLE "companies" ADD COLUMN     "country" TEXT,
ADD COLUMN     "currency" TEXT NOT NULL DEFAULT 'USD',
ADD COLUMN     "tax_rate_bps" INTEGER NOT NULL DEFAULT 0;

-- AlterTable
ALTER TABLE "invoices" ADD COLUMN     "tax_rate_bps" INTEGER NOT NULL DEFAULT 0;

-- AlterTable
ALTER TABLE "job_invoices" ADD COLUMN     "tax_rate_bps" INTEGER NOT NULL DEFAULT 0,
ALTER COLUMN "currency" DROP DEFAULT;


-- Rates are basis points between 0% and 100%; codes are upper-case ISO codes.
ALTER TABLE "companies" ADD CONSTRAINT "companies_tax_rate_bps_check" CHECK ("tax_rate_bps" BETWEEN 0 AND 10000);
ALTER TABLE "companies" ADD CONSTRAINT "companies_country_check" CHECK ("country" IS NULL OR "country" ~ '^[A-Z]{2}$');
ALTER TABLE "companies" ADD CONSTRAINT "companies_currency_check" CHECK ("currency" ~ '^[A-Z]{3}$');
ALTER TABLE "invoices" ADD CONSTRAINT "invoices_tax_rate_bps_check" CHECK ("tax_rate_bps" BETWEEN 0 AND 10000);
ALTER TABLE "job_invoices" ADD CONSTRAINT "job_invoices_tax_rate_bps_check" CHECK ("tax_rate_bps" BETWEEN 0 AND 10000);
