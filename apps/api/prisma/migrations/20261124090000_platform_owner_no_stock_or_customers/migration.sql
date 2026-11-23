-- The platform owner only runs the service (decided 2026-11-24): no reading of a company's spare parts,
-- stock, stock movements, transfers or customers. Job rows were closed earlier; job counts stay via platform_job_counts().
DROP POLICY IF EXISTS platform_read ON parts;
DROP POLICY IF EXISTS platform_read ON site_stock;
DROP POLICY IF EXISTS platform_read ON stock_movements;
DROP POLICY IF EXISTS platform_read ON stock_transfers;
DROP POLICY IF EXISTS platform_read ON customers;
