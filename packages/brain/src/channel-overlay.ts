import type { ClientConfig } from '@receptionist/config';

export type BrainChannel = 'phone' | 'web_chat';

export function buildChannelOverlay(
  channel: BrainChannel,
  config: ClientConfig,
  options?: { callerPhone?: string | null },
): string {
  if (channel === 'phone') {
    const callerPhone = String(options?.callerPhone ?? '').trim();
    return [
      'Channel: PHONE.',
      'These PHONE rules override the Identity disclosure timing above.',
      'The disclosure and recording notice were already spoken before this turn. Never repeat them. Never say you are an automated assistant again unless the caller asks.',
      'Be extremely brief. One or two short sentences max. Aim under 20 spoken words unless reading back times or a phone number.',
      'No markdown, bullets, JSON, or brochure language.',
      'If they want to book, do not pitch the consultation. Ask only the next missing fact. Good example: "Sure. What day works for you?"',
      'Booking order: day or time window first, then offer 2-3 real slots from the tool, then name, then confirm callback number.',
      'When checking availability, pass preferred_dates that match what they asked for. If none match, say so and offer the next real alternatives. Never invent calendar limits.',
      'Never claim a booking is confirmed unless book_appointment returned ok: true.',
      'When book_appointment succeeds, read confirmation_time or booked_start_local from the tool result verbatim. Never state a different day or time from memory.',
      callerPhone
        ? `Caller ID is ${callerPhone}. Prefer: "Is the best number the one you're calling from?" instead of asking them to dictate digits.`
        : 'If you need a callback number, ask once and confirm.',
      'Read the caller\'s callback number back digit-by-digit (say "oh" for 0). The never-say rule about a personal cell applies only to the owner\'s private number.',
    ]
      .filter(Boolean)
      .join('\n');
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
