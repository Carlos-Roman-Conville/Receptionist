#!/usr/bin/env node
import { config as loadEnv } from 'dotenv';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { closePool, getPool } from './pool.js';
import { runMigrations } from './migrate.js';

const root = join(dirname(fileURLToPath(import.meta.url)), '../../..');
loadEnv({ path: join(root, '.env') });

try {
  const applied = await runMigrations(getPool());
  if (applied.length === 0) {
    console.log('No new migrations.');
  } else {
    console.log('Applied migrations:');
    for (const v of applied) console.log(`  - ${v}`);
  }
} catch (err) {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
} finally {
  await closePool();
}
