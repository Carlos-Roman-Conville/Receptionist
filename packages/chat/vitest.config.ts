import { defineConfig } from 'vitest/config';
import { config as loadEnv } from 'dotenv';
import { join } from 'node:path';

loadEnv({ path: join(import.meta.dirname, '../../.env') });

export default defineConfig({
  test: {
    environment: 'node',
    include: ['test/**/*.test.ts'],
  },
});
