#!/usr/bin/env node
// Restore test: loads a backup into a separate, throw-away database and compares row counts with the live one.
// The live database is only read. Usage: node scripts/db-restore-test.mjs [backup file]  (default: newest in backups/)
import { createReadStream, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { ROOT, backupUrl, loadEnv, pg } from './db-lib.mjs';

loadEnv();
const dir = process.env.BACKUP_DIR ?? join(ROOT, 'backups');
const file =
  process.argv[2] ??
  join(
    dir,
    readdirSync(dir)
      .filter((n) => /^bmerc-\d{8}-\d{4}\.dump$/.test(n))
      .sort()
      .at(-1) ?? '',
  );
if (!file.endsWith('.dump')) {
  console.error(`No backup found in ${dir}. Run npm run db:backup first.`);
  process.exit(1);
}

const live = backupUrl();
const testDb = 'bmerc_restore_test';
const admin = new URL(live);
admin.pathname = '/postgres';
const test = new URL(live);
test.pathname = `/${testDb}`;

const TABLES = ['companies', 'users', 'sites', 'customers', 'devices', 'jobs', 'parts', 'site_stock', 'stock_movements', 'invoices', 'audit_logs'];
const counts = async (url) => {
  const sql = TABLES.map((t) => `select '${t}', count(*) from "${t}"`).join(' union all ');
  const rows = (await pg('psql', ['-At', '-F', '\t', `--dbname=${url}`, '-c', sql])).toString().trim().split('\n');
  return Object.fromEntries(rows.map((r) => r.split('\t')).map(([t, n]) => [t, Number(n)]));
};

const sql = (q) => pg('psql', ['-q', '-v', 'ON_ERROR_STOP=1', `--dbname=${admin}`, '-c', q]);
console.log(`Restoring ${file} into ${testDb} …`);
await sql(`DROP DATABASE IF EXISTS ${testDb}`);
await sql(`CREATE DATABASE ${testDb}`);
let ok = true;
try {
  await pg('pg_restore', ['--no-owner', '--no-privileges', '--exit-on-error', `--dbname=${test}`], { input: createReadStream(file) });
  const [a, b] = await Promise.all([counts(live), counts(test)]);
  for (const t of TABLES) {
    const same = a[t] === b[t];
    console.log(`${same ? 'OK  ' : 'DIFF'} ${t.padEnd(16)} live ${String(a[t]).padStart(6)}  backup ${String(b[t]).padStart(6)}`);
  }
  // Rows added after the backup was taken show as DIFF; that is expected for an older file.
  ok = TABLES.every((t) => b[t] > 0 || a[t] === 0);
} finally {
  await sql(`DROP DATABASE IF EXISTS ${testDb}`);
}
console.log(ok ? 'Restore test OK' : 'Restore test FAILED: some tables came back empty');
process.exit(ok ? 0 : 1);
