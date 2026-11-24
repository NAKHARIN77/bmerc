#!/usr/bin/env node
// Database backup: one pg_dump file (custom format, compressed) in backups/ (or BACKUP_DIR).
// Checks that the file can be read back, then deletes backups older than BACKUP_KEEP_DAYS (default 14).
// Run it once a day from cron (Linux) or Task Scheduler (Windows); see docs/operations.md.
import { createReadStream, createWriteStream, mkdirSync, readdirSync, statSync, unlinkSync } from 'node:fs';
import { join } from 'node:path';
import { finished } from 'node:stream/promises';
import { ROOT, backupUrl, loadEnv, pg, stamp } from './db-lib.mjs';

loadEnv();
const dir = process.env.BACKUP_DIR ?? join(ROOT, 'backups');
const keepDays = Number(process.env.BACKUP_KEEP_DAYS ?? 14);
mkdirSync(dir, { recursive: true });

const url = backupUrl();
const file = join(dir, `bmerc-${stamp()}.dump`);
const out = createWriteStream(file);
try {
  // Owners and grants are kept, so a real recovery restores the app role's access and row-level security as they were.
  await pg('pg_dump', ['--format=custom', `--dbname=${url}`], { stdoutTo: out });
  out.end();
  await finished(out);
} catch (e) {
  out.destroy();
  unlinkSync(file);
  console.error(`Backup FAILED: ${e.message}`);
  process.exit(1);
}

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
