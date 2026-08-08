#!/usr/bin/env node
import { config as loadEnv } from 'dotenv';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadClientConfigFromEnv, getActiveTools } from '@receptionist/config';
import { getPool, closePool, runMigrations } from '@receptionist/db';
import { Brain } from './respond.js';

const root = join(dirname(fileURLToPath(import.meta.url)), '../../..');
loadEnv({ path: join(root, '.env') });

const args = process.argv.slice(2);
const message = args.join(' ') || 'What do you do?';

try {
  await runMigrations(getPool());
  const config = loadClientConfigFromEnv();
  const brain = new Brain({ config, pool: getPool() });
  const tools = getActiveTools(config);

  console.log(`Active tools (${tools.length}): ${tools.map((t) => t.name).join(', ')}`);
  console.log(`Sending: ${message}\n`);

  const result = await brain.respond({
    channel: 'web_chat',
    sessionId: `cli_${Date.now()}`,
    userMessage: message,
    visitorEmail: 'cli-test@example.com',
  });

  console.log('Reply:', result.reply);
  if (result.chat) {
    console.log('Lead score:', result.chat.leadScore);
    console.log('Action:', result.chat.action);
  }
  if (result.classifier) console.log('Classifier:', result.classifier);
  if (result.toolResults.length) {
    console.log('Tools:', result.toolResults);
  }
} catch (err) {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
} finally {
  await closePool();
}
