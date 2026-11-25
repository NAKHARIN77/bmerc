#!/usr/bin/env node
// Database backup: one pg_dump file (custom format, compressed) in backups/ (or BACKUP_DIR).
// Checks that the file can be read back, then deletes backups older than BACKUP_KEEP_DAYS (default 14).
// Run it once a day from cron (Linux) or Task Scheduler (Windows); see docs/operations.md.
import { createReadStream, createWriteStream, mkdirSync, readdirSync, statSync, unlinkSync } from 'node:fs';
import { join } from 'node:path';
import { finished } from 'node:stream/promises';
import { REFORCE_RLS_SQL, ROOT, backupUrl, loadEnv, pg, psql, stamp } from './db-lib.mjs';

loadEnv();
const dir = process.env.BACKUP_DIR ?? join(ROOT, 'backups');
const keepDays = Number(process.env.BACKUP_KEEP_DAYS ?? 14);
mkdirSync(dir, { recursive: true });

const url = backupUrl();
const file = join(dir, `bmerc-${stamp()}.dump`);
// A superuser (local Docker) reads every row. A hosted database's owner is not one, and FORCEd row-level
// security hides company rows from it too. Then RLS is relaxed for the owner only while pg_dump runs, which is
// safe only if the app does not connect as the owner (it uses bmerc_app); otherwise the backup stops.
const [superuser, others] = (
  await psql(url, `SELECT (rolsuper OR rolbypassrls)::text, (SELECT count(*) FROM pg_stat_activity WHERE usename = current_user AND pid <> pg_backend_pid() AND datname = current_database()) FROM pg_roles WHERE rolname = current_user`)
).split('|');
const relax = superuser !== 'true';
if (relax && Number(others) > 0) {
  console.error('Backup FAILED: something else is connected as the database owner (is the app using the owner login?), so row-level security was not relaxed.');
  process.exit(1);
}

const out = createWriteStream(file);
try {
  if (relax) {
    await psql(url, `DO $$ DECLARE t text; BEGIN
      FOR t IN SELECT relname FROM pg_class WHERE relnamespace = 'public'::regnamespace AND relkind = 'r' AND relforcerowsecurity LOOP
        EXECUTE format('ALTER TABLE %I NO FORCE ROW LEVEL SECURITY', t);
      END LOOP; END $$`);
  }
  // Owners and grants are kept, so a real recovery restores the app role's access as it was.
  await pg('pg_dump', ['--format=custom', `--dbname=${url}`], { stdoutTo: out });
  out.end();
  await finished(out);
} catch (e) {
  out.destroy();
  unlinkSync(file);
  console.error(`Backup FAILED: ${e.message}`);
  process.exitCode = 1;
} finally {
  if (relax) await psql(url, REFORCE_RLS_SQL);
}
if (process.exitCode) process.exit(1);

// A backup that cannot be read is no backup: list its contents and count the tables.
const list = (await pg('pg_restore', ['--list'], { input: createReadStream(file) })).toString();
const tables = (list.match(/ TABLE DATA /g) ?? []).length;
if (tables === 0) {
  console.error(`Backup FAILED: ${file} has no table data`);
  process.exit(1);
}
const mb = (statSync(file).size / 1024 / 1024).toFixed(2);
console.log(`Backup OK: ${file} (${mb} MB, ${tables} tables)`);

// Keep the last keepDays days.
const cutoff = Date.now() - keepDays * 86_400_000;
for (const name of readdirSync(dir)) {
  if (!/^bmerc-\d{8}-\d{4}\.dump$/.test(name)) continue;
  const path = join(dir, name);
  if (statSync(path).mtimeMs < cutoff) {
    unlinkSync(path);
    console.log(`Deleted old backup ${name}`);
  }
}
