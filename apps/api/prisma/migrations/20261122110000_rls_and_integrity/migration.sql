-- Runtime role for the API. It does not own the tables, so RLS always applies to it.
-- Dev: docker/init creates it with LOGIN. Production: ops grants LOGIN + password outside migrations.
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'bmerc_app') THEN
    CREATE ROLE bmerc_app NOLOGIN;
  END IF;
END $$;

GRANT USAGE ON SCHEMA public TO bmerc_app;
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO bmerc_app;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO bmerc_app;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO bmerc_app;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT USAGE, SELECT ON SEQUENCES TO bmerc_app;
DO $$ BEGIN
  IF to_regclass('public._prisma_migrations') IS NOT NULL THEN
    REVOKE ALL ON "_prisma_migrations" FROM bmerc_app;
  END IF;
END $$;

-- Tenant isolation. The API sets app.company_id per transaction (SET LOCAL / set_config(..., true)).
-- Platform admins get read-only access across companies via app.platform_admin = 'on'.
DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'customers','sites','teams','devices','jobs','job_events','job_components',
    'parts','site_stock','stock_movements','job_parts','qr_print_logs','counters'
  ] LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('ALTER TABLE %I FORCE ROW LEVEL SECURITY', t);
    EXECUTE format($p$CREATE POLICY tenant_isolation ON %I
      USING (company_id = NULLIF(current_setting('app.company_id', true), '')::uuid)
      WITH CHECK (company_id = NULLIF(current_setting('app.company_id', true), '')::uuid)$p$, t);
    EXECUTE format($p$CREATE POLICY platform_read ON %I FOR SELECT
      USING (current_setting('app.platform_admin', true) = 'on')$p$, t);
  END LOOP;
END $$;

-- Stock can never go negative.
ALTER TABLE site_stock ADD CONSTRAINT site_stock_qty_nonnegative CHECK (qty >= 0);

-- Append-only ledgers: block UPDATE and DELETE.
CREATE FUNCTION forbid_change() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION '% is append-only', TG_TABLE_NAME;
END $$;

CREATE TRIGGER audit_logs_append_only BEFORE UPDATE OR DELETE ON audit_logs
  FOR EACH ROW EXECUTE FUNCTION forbid_change();
CREATE TRIGGER stock_movements_append_only BEFORE UPDATE OR DELETE ON stock_movements
  FOR EACH ROW EXECUTE FUNCTION forbid_change();
