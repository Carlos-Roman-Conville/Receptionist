import { describe, it, expect } from 'vitest';
import {
  callerDeclinedRecording,
  mediaStreamUrl,
  resolveEnvReference,
} from '../src/env.js';
import { parseTelnyxWebhook } from '../src/telnyx/types.js';

describe('voice env helpers', () => {
  it('builds media stream url with call control id', () => {
    expect(mediaStreamUrl('wss://voice.example.com', 'ctrl_123')).toBe(
      'wss://voice.example.com/media?call_control_id=ctrl_123',
    );
  });

  it('resolves env references', () => {
    process.env.TEST_TRANSFER_NUMBER = '+15551234567';
    expect(resolveEnvReference('env:TEST_TRANSFER_NUMBER')).toBe('+15551234567');
    delete process.env.TEST_TRANSFER_NUMBER;
  });

  it('detects recording decline phrases', () => {
    expect(callerDeclinedRecording('Please do not record this call')).toBe(true);
    expect(callerDeclinedRecording('I need help booking')).toBe(false);
  });
});

describe('parseTelnyxWebhook', () => {
  it('parses call.initiated events', () => {
    const parsed = parseTelnyxWebhook({
      data: {
        event_type: 'call.initiated',
        payload: {
          call_control_id: 'ctrl_abc',
          from: '+15551234567',
        },
      },
    });

    expect(parsed?.eventType).toBe('call.initiated');
    expect(parsed?.payload.call_control_id).toBe('ctrl_abc');
  });
});
