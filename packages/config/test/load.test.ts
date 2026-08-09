import { describe, it, expect } from 'vitest';
import { join } from 'node:path';
import { loadClientConfig, resolveClientPaths, getEnvPaths } from '../src/load.js';

describe('loadClientConfig', () => {
  it('loads crc-solutions when DEPLOYMENT_KIT_PATH is set', () => {
    const paths = getEnvPaths();
    const config = loadClientConfig(paths);
    expect(config.moduleConfig.meta.client_slug).toBe('crc-solutions');
    expect(config.businessDetails.identity).toBeDefined();
  });

  it('rejects missing client folder', () => {
    const paths = resolveClientPaths(
      '/nonexistent-kit-root',
      'nonexistent-client-slug-xyz',
    );
    expect(() => loadClientConfig(paths)).toThrow(/Missing required file/);
  });

  it('rejects unfilled FILL placeholders', () => {
    const paths = getEnvPaths();
    const config = loadClientConfig(paths);
    expect(config.integrationsRaw).not.toMatch(/<<FILL/);
  });
});

describe('schema validation', () => {
  it('bookable services have duration and buffer', () => {
    const paths = getEnvPaths();
    const config = loadClientConfig(paths);
    const bookable = (config.services.services ?? []).filter(
      (s) => s.bookable_directly,
    );
    expect(bookable.length).toBeGreaterThan(0);
    for (const svc of bookable) {
      expect(svc.duration_minutes).toBeDefined();
      expect(svc.buffer_minutes).toBeDefined();
    }
  });

  it('soft cap is less than hard cap', () => {
    const paths = getEnvPaths();
    const config = loadClientConfig(paths);
    const esc = config.compliance.escalation;
    expect(Number(esc?.soft_cap_minutes)).toBeLessThan(
      Number(esc?.hard_cap_minutes),
    );
  });
});
