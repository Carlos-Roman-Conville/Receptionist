import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { Pool } from 'pg';
import { loadClientConfigFromEnv } from '@receptionist/config';
import { Brain } from '@receptionist/brain';
import {
  checkRateLimit,
  countSessionMessages,
  getSessionByExternalId,
  getSessionMessages,
} from '@receptionist/db';
import { createChatServer } from '../src/server.js';

vi.mock('@receptionist/db', () => ({
  checkRateLimit: vi.fn(),
  countSessionMessages: vi.fn(),
  getSessionByExternalId: vi.fn(),
  getSessionMessages: vi.fn(),
}));

describe('chat server routes', () => {
  const pool = {} as Pool;
  const config = loadClientConfigFromEnv();
  const chatEnv = {
    port: 3000,
    host: '127.0.0.1',
    allowedOrigins: ['https://crc-solutions.org'],
    allowNoOrigin: true,
    rateLimitMax: 20,
    rateLimitWindowMs: 3_600_000,
  };

  beforeEach(() => {
    vi.mocked(getSessionByExternalId).mockResolvedValue(null);
    vi.mocked(countSessionMessages).mockResolvedValue(0);
    vi.mocked(getSessionMessages).mockResolvedValue([]);
    vi.mocked(checkRateLimit).mockResolvedValue({ allowed: true, count: 1 });
  });

  it('returns 403 for disallowed origin', async () => {
    const app = createChatServer({
      pool,
      config,
      chatEnv: { ...chatEnv, allowNoOrigin: false },
      brain: { respond: vi.fn() } as unknown as Brain,
    });

    const res = await app.inject({
      method: 'POST',
      url: '/chat',
      headers: {
        origin: 'https://evil.example',
        'content-type': 'application/json',
      },
      payload: {
        message: 'hello',
        sessionId: 'sess_test',
        email: 'visitor@example.com',
      },
    });

    expect(res.statusCode).toBe(403);
    expect(res.json().error).toBe('forbidden_origin');
    await app.close();
  });

  it('returns chat response on /chat', async () => {
    const app = createChatServer({
      pool,
      config,
      chatEnv,
      brain: {
        respond: vi.fn().mockResolvedValue({
          reply: 'We offer AI receptionist services.',
          channel: 'web_chat',
          sessionDbId: 'db-id',
          classifier: null,
          toolResults: [],
          chat: {
            reply: 'We offer AI receptionist services.',
            leadScore: 'warm',
            action: 'none',
          },
        }),
      } as unknown as Brain,
    });

    const res = await app.inject({
      method: 'POST',
      url: '/chat',
      headers: { 'content-type': 'application/json' },
      payload: {
        message: 'What do you do?',
        sessionId: 'sess_test',
        email: 'visitor@example.com',
      },
    });

    expect(res.statusCode).toBe(200);
    expect(res.json()).toMatchObject({
      reply: 'We offer AI receptionist services.',
      leadScore: 'warm',
      action: 'none',
      error: null,
    });
    await app.close();
  });

  it('supports legacy /webhook/chat path', async () => {
    const app = createChatServer({
      pool,
      config,
      chatEnv,
      brain: {
        respond: vi.fn().mockResolvedValue({
          reply: 'Hello',
          channel: 'web_chat',
          sessionDbId: 'db-id',
          classifier: null,
          toolResults: [],
          chat: { reply: 'Hello', leadScore: null, action: 'none' },
        }),
      } as unknown as Brain,
    });

    const res = await app.inject({
      method: 'POST',
      url: '/webhook/chat',
      headers: { 'content-type': 'application/json' },
      payload: {
        message: '',
        sessionId: 'sess_legacy',
        email: 'visitor@example.com',
      },
    });

    expect(res.statusCode).toBe(200);
    await app.close();
  });
});
