import { createPublicKey, verify as cryptoVerify } from 'node:crypto';

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
    const key = createPublicKey({
      key: Buffer.from(options.publicKey, 'base64'),
      format: 'der',
      type: 'spki',
    });
    return cryptoVerify(null, Buffer.from(payload), key, signature);
  } catch {
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
      stream_track: 'both_tracks',
      enable_bidirectional: true,
      bidirectional_mode: 'rtp',
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
