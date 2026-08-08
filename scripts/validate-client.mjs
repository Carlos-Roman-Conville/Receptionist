#!/usr/bin/env node
import { spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const kitPath =
  process.env.DEPLOYMENT_KIT_PATH ||
  'E:/shared programs/Business Model/Deployment Kit';
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
