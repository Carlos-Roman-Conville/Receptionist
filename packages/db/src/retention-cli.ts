#!/usr/bin/env node
import { config as loadEnv } from 'dotenv';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadClientConfigFromEnv } from '@receptionist/config';
import { closePool, getPool } from './pool.js';
import { runRetentionJob } from './retention.js';

const root = join(dirname(fileURLToPath(import.meta.url)), '../../..');
loadEnv({ path: join(root, '.env') });

try {
  const config = loadClientConfigFromEnv();
  const result = await runRetentionJob(getPool(), config);
  console.log(
    `Retention complete: ${result.recordingsDeleted} recording(s) marked deleted, ${result.transcriptsPurged} transcript(s) purged.`,
  );
} catch (err) {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
} finally {
  await closePool();
}
