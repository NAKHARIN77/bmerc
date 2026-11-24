-- CreateEnum
CREATE TYPE "WorkType" AS ENUM ('inspection', 'chip_replacement', 'board_repair');

-- AlterTable
ALTER TABLE "jobs" ADD COLUMN     "charged_at" TIMESTAMP(3),
ADD COLUMN     "credits_charged" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "work_type" "WorkType" NOT NULL DEFAULT 'inspection';

-- AlterTable
ALTER TABLE "plans" ADD COLUMN     "credit_weights" JSONB NOT NULL DEFAULT '{"inspection":1,"chip_replacement":3,"board_repair":5}';

-- AlterTable
ALTER TABLE "subscriptions" ADD COLUMN     "credit_weights" JSONB;


-- Credits (decided 2026-11-24): the plan quota now counts credits, weighted by work type. Existing companies
-- keep the weights of their current plan from today on.
UPDATE "subscriptions" s SET "credit_weights" = p."credit_weights" FROM "plans" p WHERE p."id" = s."plan_id";

-- Jobs that already passed QC this month used one inspection credit each, so the month's usage is not empty.
UPDATE "jobs" SET "credits_charged" = 1, "charged_at" = "qc_passed_at"
  WHERE "qc_passed_at" IS NOT NULL AND "qc_passed_at" >= date_trunc('month', now());

ALTER TABLE "jobs" ADD CONSTRAINT "jobs_credits_charged_check" CHECK ("credits_charged" >= 0);

-- Plan wording now speaks of credits.
UPDATE "plans" SET "features" = '["Unlimited credits", "Multiple repair-center sites", "Roles: Site Manager, Head Technician, Technician, Stock Keeper", "Head Technician assigns jobs to technicians", "Audit log and QR labels"]'::jsonb WHERE "code" = 'pro';
UPDATE "plans" SET "features" = '["200 credits per month (adjustable by admin)", "Credits per job: inspection 1, chip replacement 3, board repair 5", "Stock deduction included", "Alert at 80% of monthly credits"]'::jsonb WHERE "code" = 'basic';

-- The owner console also needs the month's credits per company: counts only, as before.
DROP FUNCTION platform_job_counts();
CREATE FUNCTION platform_job_counts()
RETURNS TABLE (company_id uuid, site_id uuid, status "JobStatus", jobs bigint, received_this_month bigint, credits_this_month bigint)
LANGUAGE plpgsql STABLE AS $$
BEGIN
  PERFORM set_config('app.job_counts', 'on', true);
  RETURN QUERY
    SELECT j.company_id, j.site_id, j.status, count(*)::bigint,
           count(*) FILTER (WHERE j.received_at >= date_trunc('month', now()))::bigint,
           coalesce(sum(j.credits_charged) FILTER (WHERE j.charged_at >= date_trunc('month', now())), 0)::bigint
    FROM jobs j
    GROUP BY 1, 2, 3;
  PERFORM set_config('app.job_counts', '', true);
END $$;
REVOKE ALL ON FUNCTION platform_job_counts() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION platform_job_counts() TO bmerc_app;
