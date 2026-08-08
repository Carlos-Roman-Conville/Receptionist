import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { Pool } from 'pg';
import { loadClientConfigFromEnv } from '@receptionist/config';
import {
  createCall,
  endCall,
  getCallByTelnyxControlId,
  logInteraction,
  upsertSession,
} from '@receptionist/db';
import { createVoiceServer } from '../src/server.js';
import type { TelnyxCallControl } from '../src/telnyx/client.js';

vi.mock('@receptionist/db', () => ({
  createCall: vi.fn(),
  endCall: vi.fn(),
  getCallByTelnyxControlId: vi.fn(),
  logInteraction: vi.fn(),
  upsertSession: vi.fn(),
  runMigrations: vi.fn(),
}));

describe('voice server webhooks', () => {
  const pool = {} as Pool;
  const config = loadClientConfigFromEnv();
  const voiceEnv = {
    port: 3001,
    host: '127.0.0.1',
    publicWsBaseUrl: 'wss://voice.example.com',
    telnyxApiKey: 'test-key',
    telnyxPublicKey: '',
    skipTelnyxSignature: true,
    deepgramApiKey: 'dg-key',
    elevenLabsApiKey: 'el-key',
    elevenLabsVoiceId: 'voice-id',
  };

  const telnyx = {
    answer: vi.fn().mockResolvedValue(undefined),
    startStreaming: vi.fn().mockResolvedValue(undefined),
    transfer: vi.fn().mockResolvedValue(undefined),
    hangup: vi.fn().mockResolvedValue(undefined),
    stopStreaming: vi.fn().mockResolvedValue(undefined),
  } as unknown as TelnyxCallControl;

  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(createCall).mockResolvedValue({
      id: 'call-db-id',
      client_slug: config.paths.clientSlug,
      session_id: null,
      telnyx_call_control_id: 'ctrl_123',
      caller_number: '+15551234567',
      direction: 'inbound',
      recording_declined: false,
      classifier_result: null,
      outcome: null,
    });
    vi.mocked(upsertSession).mockResolvedValue({
      id: 'session-id',
      client_slug: config.paths.clientSlug,
      channel: 'phone',
      external_session_id: 'call_ctrl_123',
      visitor_email: null,
      caller_phone: '+15551234567',
    });
    vi.mocked(logInteraction).mockResolvedValue(undefined);
    vi.mocked(getCallByTelnyxControlId).mockResolvedValue(null);
    vi.mocked(endCall).mockResolvedValue(undefined);
  });

  it('answers inbound call.initiated webhook', async () => {
    const app = createVoiceServer({ pool, config, voiceEnv, telnyx });

    const res = await app.inject({
      method: 'POST',
      url: '/webhooks/telnyx',
      headers: { 'content-type': 'application/json' },
      payload: {
        data: {
          event_type: 'call.initiated',
          payload: {
            call_control_id: 'ctrl_123',
            from: '+15551234567',
            direction: 'incoming',
          },
        },
      },
    });

    expect(res.statusCode).toBe(200);
    expect(telnyx.answer).toHaveBeenCalledWith('ctrl_123');
    expect(createCall).toHaveBeenCalled();
    await app.close();
  });

  it('starts streaming on call.answered', async () => {
    const app = createVoiceServer({ pool, config, voiceEnv, telnyx });

    const res = await app.inject({
      method: 'POST',
      url: '/webhooks/telnyx',
      headers: { 'content-type': 'application/json' },
      payload: {
        data: {
          event_type: 'call.answered',
          payload: { call_control_id: 'ctrl_456' },
        },
      },
    });

    expect(res.statusCode).toBe(200);
    expect(telnyx.startStreaming).toHaveBeenCalledWith(
      'ctrl_456',
      'wss://voice.example.com/media?call_control_id=ctrl_456',
    );
    await app.close();
  });
});
