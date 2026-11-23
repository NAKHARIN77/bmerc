-- The platform owner cannot read repair work row by row (20261122172109). The owner console still needs
-- job numbers per company and site, so this function returns counts only.
--
-- It turns on a narrow policy (app.job_counts) for the length of its own query and turns it off again,
-- so the caller only ever receives the grouped counts. Like app.company_id, the setting is trusted
-- to be set only by this function; the API never sets it directly.
CREATE POLICY job_counts ON "jobs" FOR SELECT
  USING (current_setting('app.job_counts', true) = 'on');

CREATE FUNCTION platform_job_counts()
RETURNS TABLE (company_id uuid, site_id uuid, status "JobStatus", jobs bigint, received_this_month bigint)
LANGUAGE plpgsql STABLE AS $$
BEGIN
  PERFORM set_config('app.job_counts', 'on', true);
  RETURN QUERY
    SELECT j.company_id, j.site_id, j.status, count(*)::bigint,
           count(*) FILTER (WHERE j.received_at >= date_trunc('month', now()))::bigint
    FROM jobs j
    GROUP BY 1, 2, 3;
  PERFORM set_config('app.job_counts', '', true);
END $$;

REVOKE ALL ON FUNCTION platform_job_counts() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION platform_job_counts() TO bmerc_app;
