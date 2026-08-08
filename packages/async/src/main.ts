#!/usr/bin/env node
import { config as loadEnv } from 'dotenv';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadClientConfigFromEnv } from '@receptionist/config';
import { closePool, getPool, runMigrations } from '@receptionist/db';
import { loadAsyncEnv } from './env.js';
import { createAsyncServer } from './server.js';

const root = join(dirname(fileURLToPath(import.meta.url)), '../../..');
loadEnv({ path: join(root, '.env') });

const asyncEnv = loadAsyncEnv();
const config = loadClientConfigFromEnv();

await runMigrations(getPool());

const app = createAsyncServer({
  pool: getPool(),
  config,
  asyncEnv,
});

try {
  await app.listen({ port: asyncEnv.port, host: asyncEnv.host });
  console.log(
    `Async service listening on http://${asyncEnv.host}:${asyncEnv.port} (client: ${config.paths.clientSlug})`,
  );
} catch (err) {
  console.error(err);
  process.exit(1);
}

async function shutdown() {
  await app.close();
  await closePool();
  process.exit(0);
}

process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
