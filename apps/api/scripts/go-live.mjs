#!/usr/bin/env node
// Before selling for real: removes every company, user, job, part and log from a database (the demo data),
// keeps the plans, the miner model list and the migration history, and creates the real platform owner account.
// A backup of the target is taken first (backups/before-go-live/).
//
// Needs in apps/api/.env (never in chat):
//   RENDER_DATABASE_URL  the database to clear (or TARGET_DATABASE_URL)
//   OWNER_EMAIL, OWNER_NAME, OWNER_PASSWORD (12+ characters)  the real platform owner
// Run from the repo root:  PG_CONTAINER=bmerc-db-1 node apps/api/scripts/go-live.mjs --yes
import argon2 from 'argon2';
import { spawnSync } from 'node:child_process';
import { join } from 'node:path';
import pg from 'pg';
import { ROOT, loadEnv } from '../../../scripts/db-lib.mjs';

loadEnv();
const raw = process.env.TARGET_DATABASE_URL ?? process.env.RENDER_DATABASE_URL;
const { OWNER_EMAIL: email, OWNER_NAME: name, OWNER_PASSWORD: password } = process.env;
const fail = (m) => {
  console.error(m);
  process.exit(1);
};
if (!raw) fail('Set RENDER_DATABASE_URL in apps/api/.env');
if (!email || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) fail('Set OWNER_EMAIL in apps/api/.env (the real platform owner email)');
if (!name) fail('Set OWNER_NAME in apps/api/.env');
if (!password || password.length < 12) fail('Set OWNER_PASSWORD in apps/api/.env (12 characters or more)');

const url = new URL(raw);
const remote = !['localhost', '127.0.0.1'].includes(url.hostname);
if (remote && !url.searchParams.has('sslmode')) url.searchParams.set('sslmode', 'require');
if (!process.argv.includes('--yes')) fail(`This DELETES all companies, users, jobs and logs in "${url.pathname.slice(1)}" on ${url.hostname}. Re-run with --yes.`);

// 1. Backup of the target, in case anything is needed later.
const backup = spawnSync(process.execPath, [join(ROOT, 'scripts/db-backup.mjs')], {
  stdio: 'inherit',
  env: { ...process.env, BACKUP_DATABASE_URL: url.toString(), BACKUP_DIR: join(ROOT, 'backups/before-go-live'), BACKUP_KEEP_DAYS: '3650' },
});
if (backup.status !== 0) fail('Backup failed; nothing was deleted.');

// 2. Clear and create the owner in one transaction: either all of it happens or none.
const useSsl = url.searchParams.get('sslmode') !== 'disable' && remote;
const plain = new URL(url);
plain.searchParams.delete('sslmode'); // pg would otherwise insist on verifying the certificate chain
const client = new pg.Client({ connectionString: plain.toString(), ssl: useSsl ? { rejectUnauthorized: false } : false });
await client.connect();
const keep = new Set(['plans', 'miner_models', '_prisma_migrations']);
try {
  await client.query('BEGIN');
  const { rows } = await client.query(`SELECT tablename FROM pg_tables WHERE schemaname = 'public'`);
  const tables = rows.map((r) => r.tablename).filter((t) => !keep.has(t));
  await client.query(`TRUNCATE ${tables.map((t) => `"${t}"`).join(', ')} RESTART IDENTITY CASCADE`);
  const hash = await argon2.hash(password, { type: argon2.argon2id });
  await client.query(`INSERT INTO users (id, email, password_hash, full_name, is_platform_admin) VALUES (gen_random_uuid(), $1, $2, $3, true)`, [
    email.toLowerCase(),
    hash,
    name,
  ]);
  await client.query('COMMIT');
  const left = await client.query(`SELECT (SELECT count(*) FROM companies) AS companies, (SELECT count(*) FROM users) AS users, (SELECT count(*) FROM plans) AS plans, (SELECT count(*) FROM miner_models) AS models`);
  console.log('Go-live OK:', left.rows[0]);
  console.log(`Sign in as ${email.toLowerCase()} with the password from OWNER_PASSWORD, then remove OWNER_PASSWORD from .env.`);
} catch (e) {
  await client.query('ROLLBACK').catch(() => {});
  fail(`Go-live FAILED, nothing was changed: ${e.message}`);
} finally {
  await client.end();
}
