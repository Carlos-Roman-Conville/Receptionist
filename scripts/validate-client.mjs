#!/usr/bin/env node
import { spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { config as loadEnv } from 'dotenv';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');

// Without this, DEPLOYMENT_KIT_PATH from .env is ignored and the script fails
// even when the variable is correctly configured.
loadEnv({ path: join(root, '.env') });
const kitPath = process.env.DEPLOYMENT_KIT_PATH;
if (!kitPath) {
  console.error('DEPLOYMENT_KIT_PATH environment variable is required');
  process.exit(2);
}
const slug = process.env.CLIENT_SLUG || 'crc-solutions';
const clientDir = join(kitPath, 'clients', slug);
const validateScript = join(kitPath, 'validate.py');

if (!existsSync(validateScript)) {
  console.error(`validate.py not found: ${validateScript}`);
  process.exit(2);
}

if (!existsSync(clientDir)) {
  console.error(`Client folder not found: ${clientDir}`);
  process.exit(2);
}

const result = spawnSync('python', [validateScript, clientDir], {
  stdio: 'inherit',
  cwd: root,
});

process.exit(result.status ?? 1);
