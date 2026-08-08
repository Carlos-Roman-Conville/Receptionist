#!/usr/bin/env node
import { config as loadEnv } from 'dotenv';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadClientConfigFromEnv } from '@receptionist/config';
import { closePool, getPool, runMigrations } from '@receptionist/db';
import { loadVoiceEnv } from './env.js';
import { createVoiceServer } from './server.js';

const root = join(dirname(fileURLToPath(import.meta.url)), '../../..');
loadEnv({ path: join(root, '.env') });

const voiceEnv = loadVoiceEnv();
const config = loadClientConfigFromEnv();

if (!config.moduleConfig.modules.phone_handling) {
  console.warn('phone_handling module is disabled in module-config.yaml');
}

await runMigrations(getPool());

const app = createVoiceServer({
  pool: getPool(),
  config,
  voiceEnv,
});

try {
  await app.listen({ port: voiceEnv.port, host: voiceEnv.host });
  console.log(
    `Voice service listening on http://${voiceEnv.host}:${voiceEnv.port} (client: ${config.paths.clientSlug})`,
  );
  console.log(`Media WebSocket base: ${voiceEnv.publicWsBaseUrl}/media`);
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
