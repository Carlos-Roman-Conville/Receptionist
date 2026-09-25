import { describe, it, expect } from 'vitest';
import { loadClientConfigFromEnv } from '../src/load.js';
import { assemblePrompt } from '../src/prompt.js';
import { getActiveTools, INACTIVE_MODULE_TOOLS } from '../src/tools.js';
import type { ClientConfig } from '../src/load.js';

describe('assemblePrompt', () => {
  const config = loadClientConfigFromEnv();
  const { systemPrompt, tools } = assemblePrompt(config);

  it('includes inbound disclosure script', () => {
    const script = String(
      (config.compliance.disclosure as Record<string, unknown>)
        .inbound_disclosure_script,
    );
    expect(systemPrompt).toContain(script);
  });

  it('includes recording notification script', () => {
    const script = String(
      (config.compliance.recording as Record<string, unknown>)
        .notification_script,
    );
    expect(systemPrompt).toContain(script);
  });

  it('includes every never_say client_specific line', () => {
    const lines = config.compliance.never_say?.client_specific ?? [];
    for (const line of lines) {
      expect(systemPrompt).toContain(line);
    }
  });

  it('includes bookable duration as 20 minutes in services section', () => {
    expect(systemPrompt).toMatch(/20 min/);
  });

  it('does not instruct telling callers the consultation is an hour', () => {
    const { sections } = assemblePrompt(config);
    expect(sections.services).toMatch(/20 min/);
    expect(sections.services).not.toMatch(/booked for an hour/i);
    expect(sections.rules).not.toMatch(/booked for an hour/i);
    expect(systemPrompt).toContain(
      'Never tell a caller the consultation is an hour long',
    );
  });

  it('includes call screening classifier when module is on', () => {
    expect(config.vipList).not.toBeNull();
    expect(systemPrompt).toContain('classifier_outputs');
  });

  it('does not embed integrations.yaml content as business knowledge', () => {
    expect(systemPrompt).not.toContain('credential_storage');
    expect(systemPrompt).not.toContain('open_blockers');
    expect(systemPrompt).not.toContain('PUSHOVER_USER_KEY');
  });

  it('exposes calendar tools when calendar_management is on', () => {
    const names = tools.map((t) => t.name);
    expect(names).toContain('book_appointment');
    expect(names).toContain('check_availability');
  });

  it('omits spoken compliance lines from the phone channel prompt', () => {
    const phonePrompt = assemblePrompt(config, { channel: 'phone' }).systemPrompt;
    expect(phonePrompt).not.toContain('Disclosure timing:');
    expect(phonePrompt).not.toContain('Inbound disclosure (first line):');
    expect(phonePrompt).not.toContain('Recording notice:');
  });

  it('omits tools for modules set to false', () => {
    const names = tools.map((t) => t.name);
    expect(config.moduleConfig.modules.email_handling).toBe(false);
    expect(config.moduleConfig.modules.sms_handling).toBe(false);
    expect(config.moduleConfig.modules.data_entry).toBe(false);
    expect(names).not.toContain('send_sms');
  });
});

describe('getActiveTools with mocked inactive calendar', () => {
  it('drops calendar tools when calendar_management is false', () => {
    const base = loadClientConfigFromEnv();
    const mocked: ClientConfig = {
      ...base,
      moduleConfig: {
        ...base.moduleConfig,
        modules: {
          ...base.moduleConfig.modules,
          calendar_management: false,
        },
      },
    };
    const names = getActiveTools(mocked).map((t) => t.name);
    for (const toolName of INACTIVE_MODULE_TOOLS.calendar_management) {
      expect(names).not.toContain(toolName);
    }
  });
});
