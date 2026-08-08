#!/usr/bin/env node
import { config as loadEnv } from 'dotenv';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadClientConfigFromEnv } from './load.js';
import { assemblePrompt } from './prompt.js';

const root = join(dirname(fileURLToPath(import.meta.url)), '../../..');
loadEnv({ path: join(root, '.env') });

try {
  const config = loadClientConfigFromEnv();
  const { systemPrompt, tools } = assemblePrompt(config);

  console.log('='.repeat(72));
  console.log(`Client: ${config.paths.clientSlug}`);
  console.log(`Path: ${config.paths.clientDir}`);
  console.log('='.repeat(72));
  console.log('\n--- SYSTEM PROMPT ---\n');
  console.log(systemPrompt);
  console.log('\n--- ACTIVE TOOLS ---\n');
  for (const t of tools) {
    console.log(`  ${t.name} (${t.module})`);
  }
  console.log(`\nTotal tools: ${tools.length}`);
} catch (err) {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
}
