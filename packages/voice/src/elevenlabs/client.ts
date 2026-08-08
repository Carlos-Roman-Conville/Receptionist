export interface ElevenLabsSynthOptions {
  apiKey: string;
  voiceId: string;
  fetchImpl?: typeof fetch;
}

export class ElevenLabsClient {
  private readonly apiKey: string;
  private readonly voiceId: string;
  private readonly fetchImpl: typeof fetch;

  constructor(options: ElevenLabsSynthOptions) {
    this.apiKey = options.apiKey;
    this.voiceId = options.voiceId;
    this.fetchImpl = options.fetchImpl ?? fetch;
  }

  async synthesize(text: string, signal?: AbortSignal): Promise<Buffer> {
    if (!this.apiKey) {
      throw new Error('ELEVENLABS_API_KEY is required');
    }
    if (!this.voiceId) {
      throw new Error('ELEVENLABS_VOICE_ID is required');
    }

    const res = await this.fetchImpl(
      `https://api.elevenlabs.io/v1/text-to-speech/${this.voiceId}/stream?output_format=ulaw_8000`,
      {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          'xi-api-key': this.apiKey,
        },
        body: JSON.stringify({
          text,
          model_id: 'eleven_turbo_v2_5',
        }),
        signal,
      },
    );

    if (!res.ok) {
      const body = await res.text();
      throw new Error(`ElevenLabs error ${res.status}: ${body.slice(0, 400)}`);
    }

    const arrayBuffer = await res.arrayBuffer();
    return Buffer.from(arrayBuffer);
  }
}

export const TELNYX_CHUNK_BYTES = 160;

export function chunkAudio(audio: Buffer, chunkSize = TELNYX_CHUNK_BYTES): Buffer[] {
  const chunks: Buffer[] = [];
  for (let offset = 0; offset < audio.length; offset += chunkSize) {
    chunks.push(audio.subarray(offset, offset + chunkSize));
  }
  return chunks;
}

export async function sleep(ms: number): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, ms));
}
