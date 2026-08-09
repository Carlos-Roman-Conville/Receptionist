import { describe, it, expect, vi } from 'vitest';
import {
  TelnyxCallControl,
  verifyTelnyxWebhook,
} from '../src/telnyx/client.js';
import { generateKeyPairSync, sign, verify } from 'node:crypto';

describe('TelnyxCallControl', () => {
  it('startStreaming requests bidirectional RTP with PCMU', async () => {
    const fetchImpl = vi.fn().mockResolvedValue({
      ok: true,
      text: async () => '',
    });

    const client = new TelnyxCallControl('test-api-key', fetchImpl);
    await client.startStreaming('ctrl_abc', 'wss://voice.example.com/media?call_control_id=ctrl_abc');

    expect(fetchImpl).toHaveBeenCalledOnce();
    const [url, init] = fetchImpl.mock.calls[0] as [string, RequestInit];
    expect(url).toBe(
      'https://api.telnyx.com/v2/calls/ctrl_abc/actions/streaming_start',
    );
    expect(JSON.parse(String(init.body))).toEqual({
      stream_url: 'wss://voice.example.com/media?call_control_id=ctrl_abc',
      stream_track: 'inbound_track',
      stream_bidirectional_mode: 'rtp',
      stream_bidirectional_codec: 'PCMU',
      stream_bidirectional_sampling_rate: 8000,
    });
  });
});

describe('verifyTelnyxWebhook', () => {
  it('accepts signatures from a raw 32-byte Ed25519 public key', () => {
    const { publicKey, privateKey } = generateKeyPairSync('ed25519');
    const rawPublicKey = publicKey
      .export({ type: 'spki', format: 'der' })
      .subarray(12)
      .toString('base64');

    const timestamp = '1700000000';
    const rawBody = '{"data":{"event_type":"call.initiated"}}';
    const payload = `${timestamp}|${rawBody}`;
    const signature = sign(null, Buffer.from(payload), privateKey).toString(
      'base64',
    );

    expect(
      verifyTelnyxWebhook(rawBody, signature, timestamp, {
        publicKey: rawPublicKey,
        skipVerification: false,
      }),
    ).toBe(true);

    expect(
      verify(
        null,
        Buffer.from(payload),
        publicKey,
        Buffer.from(signature, 'base64'),
      ),
    ).toBe(true);
  });
});
