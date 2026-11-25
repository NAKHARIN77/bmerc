#!/usr/bin/env node
// Copies this machine's database to another one (e.g. the Render database), replacing what is there.
// Target: TARGET_DATABASE_URL, or RENDER_DATABASE_URL in apps/api/.env (Render → database → Connections → External URL).
// Steps: fresh local backup → pg_restore --clean into the target → re-grant the app role.
// Usage: npm run db:copy-to -- --yes
import { spawnSync } from 'node:child_process';
import { createReadStream, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { REFORCE_RLS_SQL, ROOT, loadEnv, pg, psql } from './db-lib.mjs';

loadEnv();
const raw = process.env.TARGET_DATABASE_URL ?? process.env.RENDER_DATABASE_URL;
if (!raw) {
  console.error('Set RENDER_DATABASE_URL in apps/api/.env (the External Database URL from Render).');
  process.exit(1);
}
const target = new URL(raw);
if (!['localhost', '127.0.0.1'].includes(target.hostname) && !target.searchParams.has('sslmode')) target.searchParams.set('sslmode', 'require');
if (!process.argv.includes('--yes')) {
  console.error(`This REPLACES all data in database "${target.pathname.slice(1)}" on ${target.hostname}. Re-run with --yes to continue.`);
  process.exit(1);
}

// 1. Fresh backup of this machine's data.
const b = spawnSync(process.execPath, [join(ROOT, 'scripts/db-backup.mjs')], { stdio: 'inherit' });
if (b.status !== 0) process.exit(1);
const dir = process.env.BACKUP_DIR ?? join(ROOT, 'backups');
const file = join(dir, readdirSync(dir).filter((n) => /^bmerc-\d{8}-\d{4}\.dump$/.test(n)).sort().at(-1));

// 2. Replace the target's schema and data. Objects become owned by the target user.
console.log(`Copying ${file} to ${target.hostname} …`);
await pg('pg_restore', ['--clean', '--if-exists', '--no-owner', '--no-privileges', '--exit-on-error', `--dbname=${target}`], { input: createReadStream(file) });

// 3. The restore drops the app role's table grants; give them back (no-op if the role does not exist).
await pg('psql', ['-q', '-v', 'ON_ERROR_STOP=1', `--dbname=${target}`, '-c', `DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'bmerc_app') THEN
    GRANT USAGE ON SCHEMA public TO bmerc_app;
    GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO bmerc_app;
    GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO bmerc_app;
    GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA public TO bmerc_app;
    REVOKE ALL ON "_prisma_migrations" FROM bmerc_app;
  END IF;
END $$`]);

// A dump taken from a hosted database records RLS as not forced; force it again.
await psql(target, REFORCE_RLS_SQL);

const counts = (await pg('psql', ['-At', `--dbname=${target}`, '-c', 'select count(*) from companies'])).toString().trim();
console.log(`Copy OK: ${counts} companies on the target. Sign in to check.`);
