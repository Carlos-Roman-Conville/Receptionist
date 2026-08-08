import { describe, it, expect } from 'vitest';
import { spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { join } from 'node:path';

describe('acceptance gate — validate.py', () => {
  it('PASS for crc-solutions Deployment Kit', () => {
    const kitPath =
      process.env.DEPLOYMENT_KIT_PATH ||
      'E:/shared programs/Business Model/Deployment Kit';
    const slug = process.env.CLIENT_SLUG || 'crc-solutions';
    const validateScript = join(kitPath, 'validate.py');
    const clientDir = join(kitPath, 'clients', slug);

    if (!existsSync(validateScript)) {
      console.warn('validate.py not found — skipping gate test');
      return;
    }

    const result = spawnSync('python', [validateScript, clientDir], {
      encoding: 'utf-8',
    });

    expect(result.status, result.stderr || result.stdout).toBe(0);
    expect(result.stdout || result.stderr).toMatch(/PASS/i);
  });
});
