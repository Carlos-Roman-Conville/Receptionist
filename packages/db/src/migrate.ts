import { readFileSync, readdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { Pool } from 'pg';
import { getPool } from './pool.js';

const migrationsDir = join(dirname(fileURLToPath(import.meta.url)), '../migrations');

export async function ensureMigrationsTable(pool: Pool): Promise<void> {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      version TEXT PRIMARY KEY,
      applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);
}

export function listMigrationFiles(): string[] {
  return readdirSync(migrationsDir)
    .filter((f) => f.endsWith('.sql'))
    .sort();
}

export async function getAppliedVersions(pool: Pool): Promise<Set<string>> {
  const result = await pool.query<{ version: string }>(
    'SELECT version FROM schema_migrations',
  );
  return new Set(result.rows.map((r) => r.version));
}

export async function runMigrations(pool: Pool = getPool()): Promise<string[]> {
  await ensureMigrationsTable(pool);
  const applied = await getAppliedVersions(pool);
  const newlyApplied: string[] = [];

  for (const file of listMigrationFiles()) {
    if (applied.has(file)) continue;
    const sql = readFileSync(join(migrationsDir, file), 'utf-8');
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      await client.query(sql);
      await client.query(
        'INSERT INTO schema_migrations (version) VALUES ($1)',
        [file],
      );
      await client.query('COMMIT');
      newlyApplied.push(file);
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }
  }

  return newlyApplied;
}
