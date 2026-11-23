-- CreateTable
CREATE TABLE "job_tests" (
    "id" UUID NOT NULL,
    "company_id" UUID NOT NULL,
    "job_id" UUID NOT NULL,
    "tested_on" DATE NOT NULL,
    "tested_by_id" UUID NOT NULL,
    "work_done" TEXT,
    "results" JSONB NOT NULL,
    "passed" BOOLEAN NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "job_tests_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "job_tests_job_id_idx" ON "job_tests"("job_id");

-- AddForeignKey
ALTER TABLE "job_tests" ADD CONSTRAINT "job_tests_job_id_fkey" FOREIGN KEY ("job_id") REFERENCES "jobs"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
