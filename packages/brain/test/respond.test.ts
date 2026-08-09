import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { Pool } from 'pg';
import { loadClientConfigFromEnv } from '@receptionist/config';
import { appendMessage, upsertSession } from '@receptionist/db';
import { Brain } from '../src/respond.js';
import type { ClaudeClient, ClaudeResponse } from '../src/claude.js';

vi.mock('@receptionist/db', () => ({
  appendMessage: vi.fn().mockResolvedValue(undefined),
  upsertSession: vi.fn().mockResolvedValue({
    id: 'session-db-id',
    client_slug: 'crc-solutions',
    channel: 'phone',
    external_session_id: 'call_test',
    visitor_email: null,
    caller_phone: '+15551234567',
  }),
  logInteraction: vi.fn().mockResolvedValue(undefined),
  addBriefingItem: vi.fn().mockResolvedValue(undefined),
  createLead: vi.fn().mockResolvedValue(undefined),
}));

describe('Brain tool loop', () => {
  const pool = {} as Pool;
  const config = loadClientConfigFromEnv();

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('feeds tool results back to Claude before returning the reply', async () => {
    const createMessage = vi
      .fn()
      .mockResolvedValueOnce({
        id: 'msg-1',
        stop_reason: 'tool_use',
        content: [
          { type: 'text', text: 'Checking the calendar now.' },
          {
            type: 'tool_use',
            id: 'toolu_1',
            name: 'check_availability',
            input: {},
          },
        ],
      } satisfies ClaudeResponse)
      .mockResolvedValueOnce({
        id: 'msg-2',
        stop_reason: 'end_turn',
        content: [
          {
            type: 'text',
            text: 'I have Monday at 10 AM open for a consultation.',
          },
        ],
      } satisfies ClaudeResponse);

    const claude = { createMessage } as unknown as ClaudeClient;
    const brain = new Brain({ pool, config, claude });

    const response = await brain.respond({
      channel: 'phone',
      sessionId: 'call_test',
      userMessage: 'What times are available next week?',
    });

    expect(createMessage).toHaveBeenCalledTimes(2);
    expect(response.toolResults).toEqual([
      expect.objectContaining({ name: 'check_availability', ok: true }),
    ]);
    expect(response.reply).toContain('Monday at 10 AM');
    expect(appendMessage).toHaveBeenCalledWith(
      pool,
      'session-db-id',
      'assistant',
      expect.stringContaining('Monday at 10 AM'),
    );
  });
});
