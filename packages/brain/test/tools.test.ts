import { describe, it, expect } from 'vitest';
import { loadClientConfigFromEnv, getActiveTools } from '@receptionist/config';
import { buildAnthropicTools } from '../src/tools/registry.js';

describe('tool registry', () => {
  it('builds anthropic schemas only for active modules', () => {
    const config = loadClientConfigFromEnv();
    const active = getActiveTools(config);
    const anthropic = buildAnthropicTools(active);

    expect(active.some((t) => t.name === 'book_appointment')).toBe(true);
    expect(anthropic.every((t) => t.input_schema.type === 'object')).toBe(true);

    const mocked = {
      ...config,
      moduleConfig: {
        ...config.moduleConfig,
        modules: {
          ...config.moduleConfig.modules,
          calendar_management: false,
          emergency_routing: false,
        },
      },
    };
    const reduced = getActiveTools(mocked);
    const names = reduced.map((t) => t.name);
    expect(names).not.toContain('book_appointment');
    expect(names).not.toContain('transfer_call');
  });
});
