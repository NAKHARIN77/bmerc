-- CreateEnum
CREATE TYPE "PartRequestStatus" AS ENUM ('pending', 'approved', 'rejected', 'cancelled');

-- CreateTable
CREATE TABLE "part_requests" (
    "id" UUID NOT NULL,
    "company_id" UUID NOT NULL,
    "job_id" UUID NOT NULL,
    "site_id" UUID NOT NULL,
    "part_id" UUID NOT NULL,
    "qty" INTEGER NOT NULL,
    "note" TEXT,
    "status" "PartRequestStatus" NOT NULL DEFAULT 'pending',
    "requested_by_id" UUID NOT NULL,
    "decided_by_id" UUID,
    "decided_at" TIMESTAMP(3),
    "decision_note" TEXT,
    "job_part_id" UUID,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "part_requests_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "part_requests_company_id_status_idx" ON "part_requests"("company_id", "status");

-- CreateIndex
CREATE INDEX "part_requests_job_id_idx" ON "part_requests"("job_id");

-- AddForeignKey
ALTER TABLE "part_requests" ADD CONSTRAINT "part_requests_job_id_fkey" FOREIGN KEY ("job_id") REFERENCES "jobs"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "part_requests" ADD CONSTRAINT "part_requests_site_id_fkey" FOREIGN KEY ("site_id") REFERENCES "sites"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "part_requests" ADD CONSTRAINT "part_requests_part_id_fkey" FOREIGN KEY ("part_id") REFERENCES "parts"("id") ON DELETE RESTRICT ON UPDATE CASCADE;


-- Part requests belong to one company. No platform_read: the platform owner never sees a company's parts or jobs.
ALTER TABLE "part_requests" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "part_requests" FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "part_requests"
  USING (company_id = NULLIF(current_setting('app.company_id', true), '')::uuid)
  WITH CHECK (company_id = NULLIF(current_setting('app.company_id', true), '')::uuid);
ALTER TABLE "part_requests" ADD CONSTRAINT "part_requests_qty_positive" CHECK (qty > 0);
