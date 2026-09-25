import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { Pool } from 'pg';
import { loadClientConfigFromEnv } from '@receptionist/config';
import type { Brain } from '@receptionist/brain';
import {
  getSessionByExternalId,
  getSessionMessages,
  logInteraction,
  updateCall,
} from '@receptionist/db';
import { CallSession } from '../src/session/call-session.js';
import type { TelnyxCallControl } from '../src/telnyx/client.js';
import { ElevenLabsClient } from '../src/elevenlabs/client.js';

vi.mock('@receptionist/db', () => ({
  getSessionByExternalId: vi.fn(),
  getSessionMessages: vi.fn(),
  logInteraction: vi.fn(),
  updateCall: vi.fn(),
}));

describe('CallSession', () => {
  const pool = {} as Pool;
  const config = loadClientConfigFromEnv();
  const transfer = vi.fn().mockResolvedValue(undefined);
  const telnyx = { transfer } as unknown as TelnyxCallControl;
  const sendMedia = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
    process.env.EMERGENCY_TRANSFER_NUMBER = '+12155550142';
    vi.mocked(getSessionByExternalId).mockResolvedValue(null);
    vi.mocked(getSessionMessages).mockResolvedValue([]);
    vi.mocked(updateCall).mockResolvedValue(undefined);
    vi.mocked(logInteraction).mockResolvedValue(undefined);
  });

  it('transfers on emergency tool result', async () => {
    const respond = vi.fn().mockResolvedValue({
      reply: 'Connecting you now.',
      channel: 'phone',
      sessionDbId: 'session-id',
      classifier: 'EMERGENCY_CLIENT_DOWN',
      toolResults: [{ name: 'transfer_call', ok: true, message: 'Transfer initiated.' }],
    });

    const elevenLabs = {
      synthesize: vi.fn().mockResolvedValue(Buffer.alloc(320)),
    } as unknown as ElevenLabsClient;

    const session = new CallSession({
      callControlId: 'ctrl_test',
      callDbId: 'call-id',
      callerNumber: '+15551234567',
      externalSessionId: 'call_ctrl_test',
      config,
      pool,
      brain: { respond } as unknown as Brain,
      telnyx,
      elevenLabs,
      deepgramApiKey: 'test-key',
      sendMedia,
    });

    await session['processCallerTurn']('Our system is down');

    expect(transfer).toHaveBeenCalledWith('ctrl_test', '+12155550142');
    expect(respond).toHaveBeenCalledWith(
      expect.objectContaining({
        channel: 'phone',
        userMessage: 'Our system is down',
      }),
    );
  });

  it('supports barge-in by cancelling active speech generation', () => {
    const session = new CallSession({
      callControlId: 'ctrl_test',
      callDbId: 'call-id',
      callerNumber: null,
      externalSessionId: 'call_ctrl_test',
      config,
      pool,
      brain: { respond: vi.fn() } as unknown as Brain,
      telnyx,
      elevenLabs: { synthesize: vi.fn() } as unknown as ElevenLabsClient,
      deepgramApiKey: 'test-key',
      sendMedia,
    });

    session['speechGeneration'] = 1;
    session['speaking'] = true;
    session.bargeIn();
    expect(session['speaking']).toBe(false);
    expect(session['speechGeneration']).toBe(2);
  });
});
