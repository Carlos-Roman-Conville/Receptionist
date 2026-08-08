import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { Pool } from 'pg';
import { Brain } from '@receptionist/brain';
import { loadClientConfigFromEnv } from '@receptionist/config';
import {
  checkRateLimit,
  countSessionMessages,
  getSessionByExternalId,
  getSessionMessages,
} from '@receptionist/db';
import { handleChatMessage } from '../src/handler.js';
import { loadChatEnv } from '../src/env.js';

vi.mock('@receptionist/db', () => ({
  checkRateLimit: vi.fn(),
  countSessionMessages: vi.fn(),
  getSessionByExternalId: vi.fn(),
  getSessionMessages: vi.fn(),
}));

describe('handleChatMessage', () => {
  const pool = {} as Pool;
  const config = loadClientConfigFromEnv();
  const chatEnv = {
    ...loadChatEnv(),
    rateLimitMax: 20,
    rateLimitWindowMs: 3_600_000,
  };

  beforeEach(() => {
    vi.mocked(getSessionByExternalId).mockResolvedValue(null);
    vi.mocked(countSessionMessages).mockResolvedValue(0);
    vi.mocked(getSessionMessages).mockResolvedValue([]);
    vi.mocked(checkRateLimit).mockResolvedValue({ allowed: true, count: 1 });
  });

  it('returns 400 for invalid email', async () => {
    const result = await handleChatMessage(
      {
        pool,
        config,
        chatEnv,
        brain: { respond: vi.fn() } as unknown as Brain,
      },
      {
        message: 'hello',
        sessionId: 'sess_test',
        email: 'not-an-email',
        clientIp: '127.0.0.1',
      },
    );

    expect(result.statusCode).toBe(400);
    expect(result.body.error).toBe('missing_email');
  });

  it('returns 429 when session rate limit exceeded', async () => {
    vi.mocked(checkRateLimit).mockResolvedValueOnce({
      allowed: false,
      count: 21,
    });

    const result = await handleChatMessage(
      {
        pool,
        config,
        chatEnv,
        brain: { respond: vi.fn() } as unknown as Brain,
      },
      {
        message: 'hello',
        sessionId: 'sess_test',
        email: 'visitor@example.com',
        clientIp: '127.0.0.1',
      },
    );

    expect(result.statusCode).toBe(429);
    expect(result.body.error).toBe('rate_limit');
  });

  it('allows empty first message as session start', async () => {
    const respond = vi.fn().mockResolvedValue({
      reply: 'Welcome disclosure and hello.',
      channel: 'web_chat',
      sessionDbId: 'db-id',
      classifier: null,
      toolResults: [],
      chat: {
        reply: 'Welcome disclosure and hello.',
        leadScore: null,
        action: 'none',
      },
    });

    const result = await handleChatMessage(
      {
        pool,
        config,
        chatEnv,
        brain: { respond } as unknown as Brain,
      },
      {
        message: '',
        sessionId: 'sess_test',
        email: 'visitor@example.com',
        clientIp: '127.0.0.1',
      },
    );

    expect(result.statusCode).toBe(200);
    expect(respond).toHaveBeenCalledWith(
      expect.objectContaining({
        userMessage: '(Visitor opened chat.)',
      }),
    );
  });

  it('rejects session email mismatch', async () => {
    vi.mocked(getSessionByExternalId).mockResolvedValue({
      id: 'existing',
      client_slug: config.paths.clientSlug,
      channel: 'web_chat',
      external_session_id: 'sess_test',
      visitor_email: 'other@example.com',
      caller_phone: null,
    });

    const result = await handleChatMessage(
      {
        pool,
        config,
        chatEnv,
        brain: { respond: vi.fn() } as unknown as Brain,
      },
      {
        message: 'hello',
        sessionId: 'sess_test',
        email: 'visitor@example.com',
        clientIp: '127.0.0.1',
      },
    );

    expect(result.statusCode).toBe(400);
    expect(result.body.error).toBe('session_email_mismatch');
  });
});
