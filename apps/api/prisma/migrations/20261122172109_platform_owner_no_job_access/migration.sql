-- Platform owner sees every company's data except repair work (decided 2026-11-22):
-- jobs and everything recorded about them, including the devices received and repair billing.
-- Aggregate numbers for the owner console must come from a dedicated function, not row access.
DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'jobs','job_events','job_components','job_parts','qr_print_logs','devices',
    'job_invoices','job_invoice_lines','job_payments'
  ] LOOP
    EXECUTE format('DROP POLICY IF EXISTS platform_read ON %I', t);
  END LOOP;
END $$;
