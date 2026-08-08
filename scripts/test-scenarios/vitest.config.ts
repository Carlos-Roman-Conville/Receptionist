import { defineConfig } from 'vitest/config';
import { config as loadEnv } from 'dotenv';
import { join } from 'node:path';

loadEnv({ path: join(import.meta.dirname, '../../.env') });

export default defineConfig({
  test: {
    environment: 'node',
    include: ['scripts/test-scenarios/**/*.test.ts'],
    root: join(import.meta.dirname, '../..'),
    testTimeout: 30_000,
  },
});
