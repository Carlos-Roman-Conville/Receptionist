#!/usr/bin/env node
import { config as loadEnv } from 'dotenv';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadClientConfigFromEnv } from '@receptionist/config';
import { closePool, getPool, runMigrations } from '@receptionist/db';
import { runDailyBriefing } from './briefing/run.js';

const root = join(dirname(fileURLToPath(import.meta.url)), '../../..');
loadEnv({ path: join(root, '.env') });

await runMigrations(getPool());
const config = loadClientConfigFromEnv();
const result = await runDailyBriefing(getPool(), config);

console.log(JSON.stringify(result, null, 2));
await closePool();
process.exit(result.ok ? 0 : 1);
