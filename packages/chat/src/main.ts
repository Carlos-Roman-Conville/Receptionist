#!/usr/bin/env node
import { config as loadEnv } from 'dotenv';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadClientConfigFromEnv } from '@receptionist/config';
import { closePool, getPool, runMigrations } from '@receptionist/db';
import { loadChatEnv } from './env.js';
import { createChatServer } from './server.js';

const root = join(dirname(fileURLToPath(import.meta.url)), '../../..');
loadEnv({ path: join(root, '.env') });

const chatEnv = loadChatEnv();
const config = loadClientConfigFromEnv();

if (chatEnv.allowedOrigins.length === 0 && !chatEnv.allowNoOrigin) {
  console.warn(
    'CHAT_ALLOWED_ORIGINS is empty and CHAT_ALLOW_NO_ORIGIN is not set. Browser requests will be rejected.',
  );
}

await runMigrations(getPool());

const app = createChatServer({
  pool: getPool(),
  config,
  chatEnv,
});

try {
  await app.listen({ port: chatEnv.port, host: chatEnv.host });
  console.log(
    `Chat service listening on http://${chatEnv.host}:${chatEnv.port} (client: ${config.paths.clientSlug})`,
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
