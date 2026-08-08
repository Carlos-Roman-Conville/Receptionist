import pg from 'pg';

let pool: pg.Pool | null = null;

export function getDatabaseUrl(): string {
  const url = process.env.DATABASE_URL;
  if (!url) {
    throw new Error('DATABASE_URL environment variable is required');
  }
  return url;
}

export function getPool(): pg.Pool {
  if (!pool) {
    pool = new pg.Pool({ connectionString: getDatabaseUrl() });
  }
  return pool;
}

export async function closePool(): Promise<void> {
  if (pool) {
    await pool.end();
    pool = null;
  }
}

export type { Pool, PoolClient, QueryResult } from 'pg';
