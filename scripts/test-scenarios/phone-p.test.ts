import { describe, it, expect, vi, beforeEach } from 'vitest';
import { loadClientConfigFromEnv } from '@receptionist/config';
import { executeTool } from '@receptionist/brain';
import { CallSession } from '@receptionist/voice';
import {
  applyKeywordTripwire,
  classifyFromToolInput,
  parseClassifierConfig,
} from '@receptionist/brain';
import {
  callerDeclinedRecording,
  resolveEmergencyTransferNumber,
} from '@receptionist/voice';
import { softCapMinutes, hardCapMinutes } from '@receptionist/voice';
import { poolStub } from './helpers.js';

vi.mock('@receptionist/db', () => ({
  logInteraction: vi.fn().mockResolvedValue(undefined),
  addBriefingItem: vi.fn().mockResolvedValue(undefined),
  createLead: vi.fn(),
  updateCall: vi.fn().mockResolvedValue(undefined),
  getSessionByExternalId: vi.fn().mockResolvedValue(null),
  getSessionMessages: vi.fn().mockResolvedValue([]),
}));

vi.mock('@receptionist/async', () => ({
  sendEmergencyPushover: vi.fn().mockResolvedValue({ sent: true }),
  sendPushoverMessage: vi.fn().mockResolvedValue({ sent: true }),
}));

describe('P-scenarios — phone acceptance', () => {
  const config = loadClientConfigFromEnv();
  const pool = poolStub;

  beforeEach(() => {
    vi.clearAllMocks();
    process.env.EMERGENCY_TRANSFER_NUMBER = '+18563979706';
    process.env.GOOGLE_CALENDAR_CLIENT_ID = '';
    process.env.GOOGLE_CALENDAR_CLIENT_SECRET = '';
    process.env.GOOGLE_CALENDAR_REFRESH_TOKEN = '';
  });

  it('P1 — booking queues calendar write with appointment details', async () => {
    const { addBriefingItem } = await import('@receptionist/db');
    const result = await executeTool(
      'book_appointment',
      {
        name: 'Alex',
        email: 'alex@example.com',
        start_time: '2026-08-08T10:00:00-04:00',
        service_name: 'Consultation',
      },
      {
        pool,
        config,
        clientSlug: config.paths.clientSlug,
        channel: 'phone',
        lastUserMessage: 'Book me for tomorrow morning',
      },
    );

    expect(result.ok).toBe(true);
    expect(addBriefingItem).toHaveBeenCalledWith(
      pool,
      expect.objectContaining({ itemType: 'booking' }),
    );

    const services = config.services.services ?? [];
    const consult = services.find((s) => s.bookable_directly);
    expect(String(consult?.duration_minutes ?? '')).toBe('20');
    expect(String(consult?.buffer_minutes ?? '')).toBe('40');
  });

  it('P2 — emergency transfer + Pushover on alert tool', async () => {
    process.env.EMERGENCY_TRANSFER_NUMBER = '+18563979706';
    const transfer = vi.fn().mockResolvedValue(undefined);
    const telnyx = { transfer } as never;

    const { sendEmergencyPushover } = await import('@receptionist/async');
    await executeTool(
      'send_emergency_alert',
      { summary: 'Client system is down' },
      {
        pool,
        config,
        clientSlug: config.paths.clientSlug,
        channel: 'phone',
        lastUserMessage: 'nothing is working',
      },
    );

    expect(sendEmergencyPushover).toHaveBeenCalled();

    const session = new CallSession({
      callControlId: 'ctrl_p2',
      callDbId: 'call-p2',
      callerNumber: '+15551234567',
      externalSessionId: 'call_ctrl_p2',
      config,
      pool,
      brain: {
        respond: vi.fn().mockResolvedValue({
          reply: 'Connecting you now.',
          channel: 'phone',
          sessionDbId: 's1',
          classifier: 'EMERGENCY_CLIENT_DOWN',
          toolResults: [{ name: 'transfer_call', ok: true, message: 'ok' }],
        }),
      } as never,
      telnyx,
      elevenLabs: { synthesize: vi.fn() } as never,
      deepgramApiKey: 'test',
      sendMedia: vi.fn(),
    });

    await session['processCallerTurn']('Our system is down');
    expect(transfer).toHaveBeenCalledWith(
      'ctrl_p2',
      resolveEmergencyTransferNumber(
        config.compliance.emergency as Record<string, unknown>,
      ),
    );
  });

  it('P3 — recording decline flags metadata only path', async () => {
    expect(callerDeclinedRecording('Please do not record this call')).toBe(true);
    const { updateCall } = await import('@receptionist/db');
    const session = new CallSession({
      callControlId: 'ctrl_p3',
      callDbId: 'call-p3',
      callerNumber: null,
      externalSessionId: 'call_ctrl_p3',
      config,
      pool,
      brain: { respond: vi.fn() } as never,
      telnyx: { transfer: vi.fn() } as never,
      elevenLabs: { synthesize: vi.fn() } as never,
      deepgramApiKey: 'test',
      sendMedia: vi.fn(),
    });

    await session['onTranscript']('Please do not record this call', false);
    expect(updateCall).toHaveBeenCalledWith(
      pool,
      'call-p3',
      expect.objectContaining({ recordingDeclined: true }),
    );
  });

  it('P4 — spam screened via classifier', () => {
    const classifierConfig = parseClassifierConfig(config.vipList);
    const result = classifyFromToolInput(
      'We sell extended car warranties',
      'SCREEN_OUT',
      classifierConfig,
    );
    expect(result).toBe('SCREEN_OUT');
  });

  it('P5 — barge-in cancels active speech generation', () => {
    const session = new CallSession({
      callControlId: 'ctrl_p5',
      callDbId: 'call-p5',
      callerNumber: null,
      externalSessionId: 'call_ctrl_p5',
      config,
      pool,
      brain: { respond: vi.fn() } as never,
      telnyx: { transfer: vi.fn() } as never,
      elevenLabs: { synthesize: vi.fn() } as never,
      deepgramApiKey: 'test',
      sendMedia: vi.fn(),
    });
    session['speaking'] = true;
    session['speechGeneration'] = 1;
    session.bargeIn();
    expect(session['speaking']).toBe(false);
    expect(session['speechGeneration']).toBe(2);
  });

  it('P6 — soft/hard caps configured from compliance kit', () => {
    expect(softCapMinutes(config)).toBe(8);
    expect(hardCapMinutes(config)).toBe(11);
  });

  it('P7 — next-morning booking allowed (soft 24h notice)', async () => {
    const result = await executeTool(
      'book_appointment',
      {
        name: 'Jordan',
        start_time: '2026-08-08T09:00:00-04:00',
      },
      {
        pool,
        config,
        clientSlug: config.paths.clientSlug,
        channel: 'phone',
        lastUserMessage: 'Can I get the first slot tomorrow morning?',
      },
    );
    expect(result.ok).toBe(true);
    const enforcement = String(
      (config.services.pricing_policy as { min_notice_enforcement?: string })
        ?.min_notice_enforcement ?? 'soft',
    );
    expect(enforcement).toMatch(/soft/i);
  });
});

describe('P2 supplemental — keyword tripwire beats model', () => {
  it('forces EMERGENCY_CLIENT_DOWN on tripwire phrase', () => {
    const config = loadClientConfigFromEnv();
    const cfg = parseClassifierConfig(config.vipList);
    expect(applyKeywordTripwire('Our system is down', cfg)).toBe(
      'EMERGENCY_CLIENT_DOWN',
    );
  });
});
