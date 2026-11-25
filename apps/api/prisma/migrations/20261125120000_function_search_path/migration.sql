-- Pin search_path on our functions so a role cannot shadow the tables they use (flagged by Supabase's linter).
ALTER FUNCTION forbid_change() SET search_path = public, pg_temp;
ALTER FUNCTION platform_job_counts() SET search_path = public, pg_temp;
