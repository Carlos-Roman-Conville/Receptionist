import { createPublicKey, verify as cryptoVerify } from 'node:crypto';

/** DER SPKI header for an Ed25519 public key; the raw 32-byte key follows it. */
const ED25519_SPKI_PREFIX = '302a300506032b6570032100';

export interface TelnyxSignatureOptions {
  publicKey: string;
  skipVerification: boolean;
}

export function verifyTelnyxWebhook(
  rawBody: string,
  signatureHeader: string | undefined,
  timestampHeader: string | undefined,
  options: TelnyxSignatureOptions,
): boolean {
  if (options.skipVerification) return true;
  if (!options.publicKey || !signatureHeader || !timestampHeader) {
    return false;
  }

  try {
    const payload = `${timestampHeader}|${rawBody}`;
    const signature = Buffer.from(signatureHeader, 'base64');
    // Telnyx publishes a RAW 32-byte Ed25519 public key, not a DER/SPKI one.
    // Node's createPublicKey has no raw import, so prepend the fixed 12-byte
    // Ed25519 SPKI header to turn it into something it will accept.
    const key = createPublicKey({
      key: Buffer.concat([
        Buffer.from(ED25519_SPKI_PREFIX, 'hex'),
        Buffer.from(options.publicKey, 'base64'),
      ]),
      format: 'der',
      type: 'spki',
    });
    return cryptoVerify(null, Buffer.from(payload), key, signature);
  } catch (error) {
    // Without this, a malformed key and a genuinely forged signature both
    // produce a silent 401 and are indistinguishable in the logs.
    console.error(
      'Telnyx webhook signature verification failed:',
      error instanceof Error ? error.message : error,
    );
    return false;
  }
}

export class TelnyxCallControl {
  private readonly apiKey: string;
  private readonly fetchImpl: typeof fetch;

  constructor(apiKey: string, fetchImpl: typeof fetch = fetch) {
    this.apiKey = apiKey;
    this.fetchImpl = fetchImpl;
  }

  async answer(callControlId: string): Promise<void> {
    await this.postAction(callControlId, 'answer');
  }

  async startStreaming(callControlId: string, streamUrl: string): Promise<void> {
    await this.postAction(callControlId, 'streaming_start', {
      stream_url: streamUrl,
      // Inbound only — both_tracks echoes our TTS back into Deepgram and triggers barge-in.
      stream_track: 'inbound_track',
      // Telnyx ignores outbound WS audio unless bidirectional RTP is enabled
      // with the stream_* parameter names (not enable_bidirectional).
      stream_bidirectional_mode: 'rtp',
      stream_bidirectional_codec: 'PCMU',
      stream_bidirectional_sampling_rate: 8000,
    });
  }

  async stopStreaming(callControlId: string): Promise<void> {
    await this.postAction(callControlId, 'streaming_stop');
  }

  async transfer(callControlId: string, to: string): Promise<void> {
    await this.postAction(callControlId, 'transfer', { to });
  }

  async hangup(callControlId: string): Promise<void> {
    await this.postAction(callControlId, 'hangup');
  }

  private async postAction(
    callControlId: string,
    action: string,
    body: Record<string, unknown> = {},
  ): Promise<void> {
    if (!this.apiKey) {
      throw new Error('TELNYX_API_KEY is required');
    }

    const res = await this.fetchImpl(
      `https://api.telnyx.com/v2/calls/${callControlId}/actions/${action}`,
      {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${this.apiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(body),
      },
    );

    if (!res.ok) {
      const text = await res.text();
      throw new Error(`Telnyx ${action} failed (${res.status}): ${text.slice(0, 400)}`);
    }
  }
}
