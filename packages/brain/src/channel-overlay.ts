import type { ClientConfig } from '@receptionist/config';

export type BrainChannel = 'phone' | 'web_chat';

export function buildChannelOverlay(
  channel: BrainChannel,
  config: ClientConfig,
): string {
  if (channel === 'phone') {
    return [
      'Channel: PHONE.',
      'Respond in natural spoken prose suitable for text-to-speech.',
      'Keep sentences short. No markdown, bullets, or JSON.',
      'Drive the call. End every turn with a specific question or a concrete next step so the caller is never left guessing.',
      'If the caller is vague about why they called, name the one or two things you can do for them instead of asking an open-ended question again.',
      'Ask for one piece of information at a time. Never read back a list of fields you need.',
      'When you already have what a tool needs, call it instead of asking the caller to confirm details they just gave.',
    ].join('\n');
  }

  const webSettings = (config.moduleConfig.settings as { web_chat?: Record<string, unknown> })
    ?.web_chat;
  const disclosureOnOpen = webSettings?.ai_disclosure_on_open !== false;
  const disc = config.compliance.disclosure as Record<string, unknown> | undefined;
  const disclosureScript = String(disc?.inbound_disclosure_script ?? '');

  return [
    'Channel: WEB CHAT.',
    disclosureOnOpen && disclosureScript
      ? `On the first message of a session, begin your JSON reply with the disclosure: ${disclosureScript}`
      : '',
    'Respond ONLY with valid JSON using this exact shape:',
    '{',
    '  "reply": "short message shown to the visitor",',
    '  "intent": "hiring | browsing | collaboration | question",',
    '  "leadScore": "hot | warm | cold | null",',
    '  "action": "none | request_availability | end_conversation | booked",',
    '  "leadData": { "name": null, "email": null, "roleNeeded": null, "businessType": null, "notes": null }',
    '}',
    'No text outside the JSON object. No markdown inside reply.',
    'Consultation length to callers: about 20 minutes. Book directly when calendar tools succeed.',
    'Lead scoring: hot = clear pain + wants consult soon; warm = interested but vague; cold = browsing.',
  ]
    .filter(Boolean)
    .join('\n');
}

export interface ParsedChatResponse {
  reply: string;
  intent?: string | null;
  leadScore?: 'hot' | 'warm' | 'cold' | null;
  action?: string | null;
  leadData?: Record<string, unknown> | null;
}

export function parseChatJson(raw: string): ParsedChatResponse {
  const cleaned = raw.replace(/```json\n?|```/g, '').trim();
  const parsed = JSON.parse(cleaned) as ParsedChatResponse;
  if (!parsed.reply || typeof parsed.reply !== 'string') {
    throw new Error('Chat response missing reply field');
  }
  return parsed;
}

export function chatJsonFallback(): ParsedChatResponse {
  return {
    reply:
      "Sorry, I'm having trouble right now. Please try again in a moment or email us directly.",
    leadScore: null,
    action: 'none',
  };
}
