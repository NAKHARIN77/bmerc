// Shared helpers for the backup scripts. No dependencies: Node 22 and pg_dump / pg_restore / psql,
// either installed on this machine or inside the database container (set PG_CONTAINER).
import { spawn } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

export const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');

/** Values from apps/api/.env, without overriding what is already set in the environment. */
export function loadEnv() {
  const file = join(ROOT, 'apps/api/.env');
  if (!existsSync(file)) return;
  for (const line of readFileSync(file, 'utf8').split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
    if (!m || process.env[m[1]] !== undefined) continue;
    process.env[m[1]] = m[2].replace(/^(['"])(.*)\1$/, '$2');
  }
}

/**
 * The database to back up. It must be a role that can read every row: a superuser or a role with BYPASSRLS,
 * because company tables use row-level security. Defaults to the migration role.
 */
export function backupUrl() {
  const url = process.env.BACKUP_DATABASE_URL ?? process.env.MIGRATE_DATABASE_URL;
  if (!url) throw new Error('Set BACKUP_DATABASE_URL (or MIGRATE_DATABASE_URL in apps/api/.env)');
  const u = new URL(url);
  u.searchParams.delete('schema'); // Prisma option, not a libpq one
  return u;
}

/** Run a Postgres tool, locally or with `docker exec` in PG_CONTAINER. Resolves with stdout as a Buffer. */
export function pg(tool, args, { input, stdoutTo } = {}) {
  const container = process.env.PG_CONTAINER;
  const [cmd, argv] = container ? ['docker', ['exec', '-i', container, tool, ...args]] : [tool, args];
  return new Promise((resolve, reject) => {
    const child = spawn(cmd, argv, { stdio: ['pipe', 'pipe', 'pipe'] });
    const out = [];
    let err = '';
    if (stdoutTo) child.stdout.pipe(stdoutTo);
    else child.stdout.on('data', (d) => out.push(d));
    child.stderr.on('data', (d) => (err += d));
    child.on('error', (e) => reject(new Error(`${cmd}: ${e.message}${container ? '' : ' (install the PostgreSQL client tools, or set PG_CONTAINER)'}`)));
    child.on('close', (code) => (code === 0 ? resolve(Buffer.concat(out)) : reject(new Error(`${tool} failed (${code}): ${err.trim()}`))));
    if (input) input.pipe(child.stdin);
    else child.stdin.end();
  });
}

export const stamp = (d = new Date()) => d.toISOString().slice(0, 16).replace(/[-:]/g, '').replace('T', '-');

/**
 * Every table with row-level security has it FORCEd, so the policies also bind the table owner.
 * Run after any restore (and at app start) so a dump taken without FORCE cannot leave it off.
 */
export const REFORCE_RLS_SQL = `DO $$ DECLARE t text; BEGIN
  FOR t IN SELECT relname FROM pg_class WHERE relnamespace = 'public'::regnamespace AND relkind = 'r' AND relrowsecurity LOOP
    EXECUTE format('ALTER TABLE %I FORCE ROW LEVEL SECURITY', t);
  END LOOP;
END $$`;

/** Run SQL with psql and return the trimmed text output (tuples only). */
export const psql = async (url, sql) => (await pg('psql', ['-At', '-v', 'ON_ERROR_STOP=1', `--dbname=${url}`, '-c', sql])).toString().trim();
