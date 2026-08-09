export interface TelnyxWebhookEnvelope {
  data?: {
    event_type?: string;
    id?: string;
    payload?: TelnyxCallPayload;
  };
}

export interface TelnyxCallPayload {
  call_control_id?: string;
  call_leg_id?: string;
  call_session_id?: string;
  connection_id?: string;
  from?: string;
  to?: string;
  direction?: string;
  state?: string;
}

export function parseTelnyxWebhook(body: unknown): {
  eventType: string;
  payload: TelnyxCallPayload;
} | null {
  if (!body || typeof body !== 'object') return null;
  const envelope = body as TelnyxWebhookEnvelope;
  const eventType = envelope.data?.event_type;
  const payload = envelope.data?.payload;
  if (!eventType || !payload) return null;
  return { eventType, payload };
}

export function callControlIdFromPayload(payload: TelnyxCallPayload): string | null {
  return payload.call_control_id ?? null;
}

export interface TelnyxMediaMessage {
  event?: string;
  media?: {
    track?: string;
    payload?: string;
  };
  start?: {
    call_control_id?: string;
    media_format?: {
      encoding?: string;
      sample_rate?: number;
    };
  };
}

export function parseTelnyxMediaMessage(raw: string): TelnyxMediaMessage | null {
  try {
    return JSON.parse(raw) as TelnyxMediaMessage;
  } catch {
    return null;
  }
}

export function decodeMediaPayload(payload: string): Buffer {
  return Buffer.from(payload, 'base64');
}

export function encodeMediaPayload(audio: Buffer): string {
  return audio.toString('base64');
}

/** True when Telnyx media should be sent to STT (caller audio only). */
export function isInboundMediaTrack(track: string | undefined): boolean {
  if (!track) return true;
  const normalized = track.toLowerCase();
  return normalized === 'inbound' || normalized === 'inbound_track';
}
