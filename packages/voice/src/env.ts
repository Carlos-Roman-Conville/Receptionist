export interface VoiceEnvConfig {
  port: number;
  host: string;
  publicWsBaseUrl: string;
  telnyxApiKey: string;
  telnyxPublicKey: string;
  skipTelnyxSignature: boolean;
  deepgramApiKey: string;
  elevenLabsApiKey: string;
  elevenLabsVoiceId: string;
}

export function loadVoiceEnv(): VoiceEnvConfig {
  const publicWsBaseUrl =
    process.env.VOICE_PUBLIC_WS_URL ??
    process.env.VOICE_PUBLIC_URL ??
    'ws://localhost:3001';

  return {
    port: Number(process.env.VOICE_PORT ?? 3001),
    host: process.env.VOICE_HOST ?? '0.0.0.0',
    publicWsBaseUrl: publicWsBaseUrl.replace(/\/$/, ''),
    telnyxApiKey: process.env.TELNYX_API_KEY ?? '',
    telnyxPublicKey: process.env.TELNYX_PUBLIC_KEY ?? '',
    skipTelnyxSignature: process.env.TELNYX_SKIP_SIGNATURE === '1',
    deepgramApiKey: process.env.DEEPGRAM_API_KEY ?? '',
    elevenLabsApiKey: process.env.ELEVENLABS_API_KEY ?? '',
    elevenLabsVoiceId: process.env.ELEVENLABS_VOICE_ID ?? '',
  };
}

export function mediaStreamUrl(
  publicWsBaseUrl: string,
  callControlId: string,
): string {
  const base = publicWsBaseUrl.replace(/^http/, 'ws');
  return `${base}/media?call_control_id=${encodeURIComponent(callControlId)}`;
}

export function resolveEnvReference(value: string): string | null {
  if (value.startsWith('env:')) {
    return process.env[value.slice(4)] ?? null;
  }
  if (value.startsWith('<<') || !value.trim()) {
    return null;
  }
  return value;
}

export function resolveEmergencyTransferNumber(
  emergencyConfig: Record<string, unknown> | undefined,
): string | null {
  const raw = String(emergencyConfig?.transfer_to_primary_number ?? '');
  return resolveEnvReference(raw);
}

export const RECORDING_DECLINE_PATTERNS = [
  'do not record',
  "don't record",
  'stop recording',
  'not recorded',
  'no recording',
];

export function callerDeclinedRecording(text: string): boolean {
  const lower = text.toLowerCase();
  return RECORDING_DECLINE_PATTERNS.some((pattern) => lower.includes(pattern));
}

export function callDurationMinutes(startedAtMs: number, nowMs = Date.now()): number {
  return (nowMs - startedAtMs) / 60_000;
}
