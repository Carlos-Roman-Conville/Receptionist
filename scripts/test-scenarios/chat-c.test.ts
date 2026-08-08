import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { Pool } from 'pg';
import { loadClientConfigFromEnv, assemblePrompt } from '@receptionist/config';
import { Brain } from '@receptionist/brain';
import {
  checkRateLimit,
  countSessionMessages,
  getSessionByExternalId,
  getSessionMessages,
} from '@receptionist/db';
import { createChatServer } from '@receptionist/chat';
import {
  assertMentionsConsult,
  assertNoPricing,
  cannedServicesReply,
  claudeTextResponse,
  createStubBrain,
  jsonChatReply,
  poolStub,
  stubBrainFromClaude,
} from './helpers.js';

vi.mock('@receptionist/db', () => ({
  checkRateLimit: vi.fn(),
  countSessionMessages: vi.fn(),
  getSessionByExternalId: vi.fn(),
  getSessionMessages: vi.fn(),
  upsertSession: vi.fn().mockResolvedValue({
    id: 'session-db',
    client_slug: 'crc-solutions',
    channel: 'web_chat',
    external_session_id: 'sess_test',
    visitor_email: 'test@example.com',
    caller_phone: null,
  }),
  appendMessage: vi.fn().mockResolvedValue(undefined),
  logInteraction: vi.fn().mockResolvedValue(undefined),
  createLead: vi.fn().mockResolvedValue('lead-id'),
  updateCall: vi.fn().mockResolvedValue(undefined),
  addBriefingItem: vi.fn().mockResolvedValue(undefined),
}));

describe('C-scenarios — chat acceptance', () => {
  const pool = poolStub;
  const config = loadClientConfigFromEnv();
  const chatEnv = {
    port: 3000,
    host: '127.0.0.1',
    allowedOrigins: ['https://crc-solutions.org'],
    allowNoOrigin: true,
    rateLimitMax: 20,
    rateLimitWindowMs: 600_000,
  };

  beforeEach(() => {
    vi.mocked(getSessionByExternalId).mockResolvedValue(null);
    vi.mocked(countSessionMessages).mockResolvedValue(0);
    vi.mocked(getSessionMessages).mockResolvedValue([]);
    vi.mocked(checkRateLimit).mockResolvedValue({ allowed: true, count: 1 });
  });

  it('C1 — pricing question: guardrails + mocked reply avoid quotes', async () => {
    const { systemPrompt } = assemblePrompt(config);
    expect(systemPrompt.toLowerCase()).toContain('never quote');
    assertMentionsConsult(systemPrompt);

    const reply = cannedServicesReply();
    assertNoPricing(reply);
    assertMentionsConsult(reply);

    const brain = createStubBrain(
      vi.fn().mockResolvedValue({
        reply,
        channel: 'web_chat',
        sessionDbId: 's1',
        classifier: null,
        toolResults: [],
        chat: { reply, leadScore: 'warm', action: 'none' },
      }),
    );

    const app = createChatServer({ pool, config, chatEnv, brain });
    const res = await app.inject({
      method: 'POST',
      url: '/chat',
      headers: { 'content-type': 'application/json' },
      payload: {
        message: 'How much?',
        sessionId: 'sess_c1',
        email: 'prospect@example.com',
      },
    });

    expect(res.statusCode).toBe(200);
    assertNoPricing(res.json().reply);
    assertMentionsConsult(res.json().reply);
    await app.close();
  });

  it('C2 — human request: disclosure present in prompt and first-turn overlay', async () => {
    const { systemPrompt } = assemblePrompt(config);
    const disclosure = String(
      (config.compliance.disclosure as Record<string, unknown>)
        .inbound_disclosure_script,
    );
    expect(systemPrompt).toContain(disclosure);

    const { buildChannelOverlay } = await import('@receptionist/brain');
    const overlay = buildChannelOverlay('web_chat', config);
    expect(overlay.toLowerCase()).toContain('disclosure');

    const reply = `${disclosure} I am an automated assistant. I can help now or get you to the owner.`;
    const brain = createStubBrain(
      vi.fn().mockResolvedValue({
        reply,
        channel: 'web_chat',
        sessionDbId: 's1',
        classifier: null,
        toolResults: [],
        chat: { reply, leadScore: null, action: 'none' },
      }),
    );

    const app = createChatServer({ pool, config, chatEnv, brain });
    const res = await app.inject({
      method: 'POST',
      url: '/chat',
      headers: { 'content-type': 'application/json' },
      payload: { message: '', sessionId: 'sess_c2', email: 'prospect@example.com' },
    });

    expect(res.statusCode).toBe(200);
    expect(res.json().reply.toLowerCase()).toMatch(/automated assistant|ai/);
    await app.close();
  });

  it('C3 — hot lead: warm/hot scores returned', async () => {
    const reply = 'Let us find a consultation time that works for you.';
    const brain = createStubBrain(
      vi.fn().mockResolvedValue({
        reply,
        channel: 'web_chat',
        sessionDbId: 's1',
        classifier: 'PROSPECT',
        toolResults: [{ name: 'check_availability', ok: true, message: 'queued' }],
        chat: { reply, leadScore: 'hot', action: 'request_availability' },
      }),
    );

    const app = createChatServer({ pool, config, chatEnv, brain });
    const res = await app.inject({
      method: 'POST',
      url: '/chat',
      headers: { 'content-type': 'application/json' },
      payload: {
        message: 'We need this fixed ASAP, can we book a consult tomorrow?',
        sessionId: 'sess_c3',
        email: 'hot@example.com',
      },
    });

    expect(res.statusCode).toBe(200);
    expect(res.json().leadScore).toBe('hot');
    await app.close();
  });

  it('C4 — vendor spam: cold score', async () => {
    const reply = 'We are not looking for vendor pitches. Have a good day.';
    const brain = createStubBrain(
      vi.fn().mockResolvedValue({
        reply,
        channel: 'web_chat',
        sessionDbId: 's1',
        classifier: 'SCREEN_OUT',
        toolResults: [],
        chat: { reply, leadScore: 'cold', action: 'end_conversation' },
      }),
    );

    const app = createChatServer({ pool, config, chatEnv, brain });
    const res = await app.inject({
      method: 'POST',
      url: '/chat',
      headers: { 'content-type': 'application/json' },
      payload: {
        message: 'We offer SEO services cheap, want to buy?',
        sessionId: 'sess_c4',
        email: 'vendor@example.com',
      },
    });

    expect(res.statusCode).toBe(200);
    expect(res.json().leadScore).toBe('cold');
    await app.close();
  });

  it('C5 — rate limit: 429 after bucket exhausted', async () => {
    vi.mocked(checkRateLimit).mockResolvedValueOnce({
      allowed: false,
      count: 21,
    });

    const brain = createStubBrain(
      vi.fn().mockResolvedValue({
        reply: 'ok',
        channel: 'web_chat',
        sessionDbId: 's1',
        classifier: null,
        toolResults: [],
        chat: { reply: 'ok', leadScore: null, action: 'none' },
      }),
    );
    const app = createChatServer({ pool, config, chatEnv, brain });
    const res = await app.inject({
      method: 'POST',
      url: '/chat',
      headers: { 'content-type': 'application/json' },
      payload: {
        message: 'hello again',
        sessionId: 'sess_c5',
        email: 'spam@example.com',
      },
    });

    expect(res.statusCode).toBe(429);
    expect(res.json().error).toBe('rate_limit');
    await app.close();
  });

  it('C6 — missing email: 400', async () => {
    const app = createChatServer({
      pool,
      config,
      chatEnv,
      brain: createStubBrain(vi.fn()),
    });
    const res = await app.inject({
      method: 'POST',
      url: '/chat',
      headers: { 'content-type': 'application/json' },
      payload: { message: 'hello', sessionId: 'sess_c6' },
    });

    expect(res.statusCode).toBe(400);
    await app.close();
  });

  it('C7 — bad origin: 403', async () => {
    const app = createChatServer({
      pool,
      config,
      chatEnv: { ...chatEnv, allowNoOrigin: false },
      brain: createStubBrain(vi.fn()),
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
        sessionId: 'sess_c7',
        email: 'test@example.com',
      },
    });

    expect(res.statusCode).toBe(403);
    await app.close();
  });

  it('C8 — same factual answer on phone and web chat (shared brain)', async () => {
    const factual = cannedServicesReply();
    const brain = await stubBrainFromClaude(config, pool, (_channel, _msg) =>
      claudeTextResponse(
        _channel === 'web_chat' ? jsonChatReply(factual) : factual,
      ),
    );

    const phone = await brain.respond({
      channel: 'phone',
      sessionId: 'sess_c8_phone',
      userMessage: 'What do you do?',
      callerPhone: '+15551234567',
    });

    const chat = await brain.respond({
      channel: 'web_chat',
      sessionId: 'sess_c8_chat',
      userMessage: 'What do you do?',
      visitorEmail: 'same@example.com',
    });

    expect(phone.reply).toBe(factual);
    expect(chat.reply).toBe(factual);
  });
});
