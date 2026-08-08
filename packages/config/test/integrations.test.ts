import { describe, it, expect } from 'vitest';
import { loadClientConfigFromEnv, parseCalendarIntegration } from '../src/index.js';

describe('parseCalendarIntegration', () => {
  it('reads calendar_id from integrations.yaml when module is on', () => {
    const config = loadClientConfigFromEnv();
    const integration = parseCalendarIntegration(config);
    expect(integration).not.toBeNull();
    expect(integration?.calendarId).toMatch(/@/);
  });
});
