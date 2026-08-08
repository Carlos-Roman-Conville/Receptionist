#!/usr/bin/env node
/**
 * Phase 6 acceptance runner — validate.py gate, package tests, C/P scenarios.
 */
import { spawnSync } from 'node:child_process';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');

function run(label, command, args, opts = {}) {
  console.log(`\n=== ${label} ===`);
  const result = spawnSync(command, args, {
    cwd: root,
    stdio: 'inherit',
    shell: process.platform === 'win32',
    ...opts,
  });
  if (result.status !== 0) {
    console.error(`\nFAILED: ${label}`);
    process.exit(result.status ?? 1);
  }
}

run('validate.py (Deployment Kit)', 'npm', ['run', 'validate:client']);
run('wiring checks', 'npm', ['run', 'validate:wiring']);
run('package unit tests', 'npm', ['test']);
run('acceptance scenarios (C + P)', 'npx', [
  'vitest',
  'run',
  '--config',
  'scripts/test-scenarios/vitest.config.ts',
]);

console.log('\nAcceptance suite passed.');
console.log('Complete manual sign-off checklist: scripts/test-scenarios/README.md');
