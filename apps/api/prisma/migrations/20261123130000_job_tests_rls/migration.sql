-- Same tenant isolation as the other job tables. No platform_read: the platform owner cannot read repair work.
ALTER TABLE "job_tests" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "job_tests" FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "job_tests"
  USING (company_id = NULLIF(current_setting('app.company_id', true), '')::uuid)
  WITH CHECK (company_id = NULLIF(current_setting('app.company_id', true), '')::uuid);

-- Results are pass / fail / not_tested per item.
ALTER TABLE "job_tests" ADD CONSTRAINT "job_tests_results_object" CHECK (jsonb_typeof("results") = 'object');
