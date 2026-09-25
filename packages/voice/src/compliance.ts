import type { ClientConfig } from '@receptionist/config';

/** Asked when the kit does not supply wording; without it the AI waits in silence. */
const DEFAULT_OPENING_QUESTION = 'How can I help you today?';

export function openingQuestion(config: ClientConfig): string {
  const greeting = config.compliance.greeting as Record<string, unknown> | undefined;
  const configured = String(greeting?.opening_question ?? '').trim();
  return configured || DEFAULT_OPENING_QUESTION;
}

export function buildOpeningScript(config: ClientConfig): string {
  const disclosure = config.compliance.disclosure as Record<string, unknown> | undefined;
  const recording = config.compliance.recording as Record<string, unknown> | undefined;

  const disclosureScript = String(disclosure?.inbound_disclosure_script ?? '').trim();
  const recordingScript = String(recording?.notification_script ?? '').trim();

  return [disclosureScript, recordingScript, openingQuestion(config)]
    .filter(Boolean)
    .join(' ');
}

/** Remove compliance lines Claude sometimes re-speaks after the canned opening. */
export function stripRepeatedCompliance(text: string, config: ClientConfig): string {
  const disclosure = config.compliance.disclosure as Record<string, unknown> | undefined;
  const recording = config.compliance.recording as Record<string, unknown> | undefined;
  const phrases = [
    String(disclosure?.inbound_disclosure_script ?? '').trim(),
    String(recording?.notification_script ?? '').trim(),
  ].filter(Boolean);

  let out = text.trim();
  for (const phrase of phrases) {
    const escaped = phrase.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    out = out.replace(new RegExp(escaped, 'gi'), ' ');
  }

  // Catch common rewrites of the same compliance openers.
  out = out.replace(
    /(?:good\s+(?:morning|afternoon|evening)[,.]?\s*)?(?:thanks|thank you) for calling[^.?!]*[.?!]\s*/gi,
    ' ',
  );
  out = out.replace(
    /this is an automated assistant(?:,?\s*and)?(?:\s*this call is recorded[^.?!]*)?[.?!]?\s*/gi,
    ' ',
  );
  out = out.replace(/this call is recorded[^.?!]*[.?!]?\s*/gi, ' ');

  return out.replace(/\s{2,}/g, ' ').replace(/\s+([,.!?])/g, '$1').trim();
}

export function hardCapScript(config: ClientConfig): string {
  const escalation = config.compliance.escalation as Record<string, unknown> | undefined;
  return String(
    escalation?.at_hard_cap_script ??
      "I want to make sure we have everything we need. I'll have someone follow up with you directly.",
  ).trim();
}

export function softCapMinutes(config: ClientConfig): number {
  const escalation = config.compliance.escalation as Record<string, unknown> | undefined;
  const value = escalation?.soft_cap_minutes;
  return typeof value === 'number' ? value : Number(value ?? 8);
}

export function hardCapMinutes(config: ClientConfig): number {
  const escalation = config.compliance.escalation as Record<string, unknown> | undefined;
  const value = escalation?.hard_cap_minutes;
  return typeof value === 'number' ? value : Number(value ?? 11);
}
