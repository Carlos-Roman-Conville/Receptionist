import { describe, it, expect } from 'vitest';
import { loadClientConfigFromEnv } from '@receptionist/config';
import {
  buildOpeningScript,
  hardCapMinutes,
  softCapMinutes,
} from '../src/compliance.js';

describe('phone compliance scripts', () => {
  const config = loadClientConfigFromEnv();

  it('builds opening from deployment kit disclosure and recording', () => {
    const opening = buildOpeningScript(config);
    expect(opening.length).toBeGreaterThan(20);
    expect(opening).toContain('automated assistant');
    expect(opening.toLowerCase()).toContain('recorded');
  });

  it('reads soft and hard caps from compliance config', () => {
    expect(softCapMinutes(config)).toBe(8);
    expect(hardCapMinutes(config)).toBe(11);
  });
});
