// Run at container start, after `prisma migrate deploy`. Gives the API its own login (bmerc_app) so it never
// connects as the database owner, then prints the connection URL the API should use.
//
// Hosted databases differ: if the owner may not create or alter roles, the API falls back to the owner URL.
// That is still safe for company data, because every table with row-level security has it FORCEd,
// which applies the policies to the owner as well. A warning is logged so this is visible.
import pg from 'pg';

const ownerUrl = process.env.MIGRATE_DATABASE_URL;
const password = process.env.APP_DB_PASSWORD;
const log = (m) => process.stderr.write(`[prepare-db] ${m}\n`);

const client = new pg.Client({ connectionString: ownerUrl });
await client.connect();
let url = ownerUrl;
try {
  const { rows } = await client.query('SELECT rolsuper, rolcreaterole FROM pg_roles WHERE rolname = current_user');
  const canManageRoles = rows[0]?.rolsuper || rows[0]?.rolcreaterole;
  if (!password) {
    log('APP_DB_PASSWORD is not set; the API uses the owner connection');
  } else if (!canManageRoles) {
    log('this database user may not create roles; the API uses the owner connection (RLS is forced on company tables)');
  } else {
    try {
      const pw = client.escapeLiteral(password);
      await client.query('BEGIN');
      await client.query(`DO $$ BEGIN
        IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'bmerc_app') THEN CREATE ROLE bmerc_app; END IF;
      END $$`);
      // New roles never bypass RLS; only a BYPASSRLS role could change that, so it is not touched here.
      await client.query(`ALTER ROLE bmerc_app LOGIN PASSWORD ${pw}`);
      // Same grants as the RLS migration; repeated here because a restored backup may not carry them.
      await client.query(`DO $$ BEGIN EXECUTE format('GRANT CONNECT ON DATABASE %I TO bmerc_app', current_database()); END $$`);
      await client.query(`
        GRANT USAGE ON SCHEMA public TO bmerc_app;
        GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO bmerc_app;
        GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO bmerc_app;
        GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA public TO bmerc_app;
        REVOKE ALL ON "_prisma_migrations" FROM bmerc_app;
      `);
      await client.query('COMMIT');
      const u = new URL(ownerUrl);
      u.username = 'bmerc_app';
      u.password = encodeURIComponent(password);
      // Prove the login works before handing it to the API.
      const probe = new pg.Client({ connectionString: u.toString() });
      await probe.connect();
      await probe.query('SELECT 1 FROM companies LIMIT 1');
      await probe.end();
      url = u.toString();
      log('API connects as bmerc_app');
    } catch (e) {
      await client.query('ROLLBACK').catch(() => {});
      log(`could not set up bmerc_app (${e.message}); the API uses the owner connection (RLS is forced on company tables)`);
    }
  }
} finally {
  await client.end();
}
process.stdout.write(url);
