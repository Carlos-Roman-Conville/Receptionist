import type { ClientConfig } from './load.js';
import { formatToolsSection, getActiveTools } from './tools.js';

function str(value: unknown): string {
  if (value === null || value === undefined) return '';
  if (typeof value === 'string') return value.trim();
  if (typeof value === 'number' || typeof value === 'boolean') return String(value);
  return String(value).trim();
}

function block(title: string, body: string): string {
  const trimmed = body.trim();
  if (!trimmed) return `## ${title}\n\n(none configured)`;
  return `## ${title}\n\n${trimmed}`;
}

function formatHoursRegular(
  regular: Record<string, unknown> | undefined,
): string {
  if (!regular) return '';
  return Object.entries(regular)
    .map(([day, value]) => {
      if (value && typeof value === 'object' && 'by_appointment' in value) {
        return `- ${day}: by appointment only`;
      }
      const v = value as { open?: string; close?: string };
      return `- ${day}: ${v.open ?? '?'} – ${v.close ?? '?'}`;
    })
    .join('\n');
}

function formatServicesList(config: ClientConfig): string {
  const items = config.services.services ?? [];
  return items
    .map((svc) => {
      const bookable = svc.bookable_directly ? ' (bookable)' : '';
      const dur =
        svc.duration_minutes !== undefined
          ? ` — ${svc.duration_minutes} min`
          : '';
      const buf =
        svc.buffer_minutes !== undefined
          ? ` + ${svc.buffer_minutes} min buffer`
          : '';
      const desc = str((svc as Record<string, unknown>).description);
      return `- ${svc.name}${bookable}${dur}${buf}${desc ? `: ${desc}` : ''}`;
    })
    .join('\n');
}

function formatNeverSay(config: ClientConfig): string {
  const ns = config.compliance.never_say;
  const lines = [...(ns?.locked ?? []), ...(ns?.client_specific ?? [])];
  return lines.map((l) => `- ${l}`).join('\n');
}

function formatEscalationTriggers(config: ClientConfig): string {
  const esc = config.compliance.escalation;
  if (!esc) return '';
  const triggers = esc.triggers as
    | { locked?: string[]; client_specific?: string[] }
    | undefined;
  const locked = triggers?.locked ?? [];
  const specific = triggers?.client_specific ?? [];
  return [...locked, ...specific].map((t) => `- ${t}`).join('\n');
}

function formatVipList(config: ClientConfig): string {
  if (!config.vipList) return '';
  return JSON.stringify(config.vipList, null, 2);
}

function sectionIdentity(config: ClientConfig): string {
  const id = config.businessDetails.identity as Record<string, unknown>;
  const hours = config.businessDetails.hours;
  const disc = config.compliance.disclosure as Record<string, unknown> | undefined;

  return [
    `You are the automated receptionist for ${str(id.business_name)}.`,
    str(id.owner_name)
      ? `The owner is ${str(id.owner_name)}, ${str(id.owner_title)}.`
      : '',
    `Timezone: ${str(hours.timezone) || 'local business timezone'}.`,
    '',
    'Business hours:',
    formatHoursRegular(hours.regular as Record<string, unknown> | undefined),
    '',
    str(hours.after_hours_policy)
      ? `After hours: ${str(hours.after_hours_policy)}`
      : '',
    '',
    disc?.inbound_disclosure_required
      ? `Inbound disclosure (first line): ${str(disc.inbound_disclosure_script)}`
      : '',
    disc?.inbound_disclosure_timing
      ? `Disclosure timing: ${str(disc.inbound_disclosure_timing)}`
      : '',
    str(disc?.if_caller_asks_if_ai)
      ? `If asked if you are AI: ${str(disc.if_caller_asks_if_ai)}`
      : '',
  ]
    .filter(Boolean)
    .join('\n');
}

function sectionPersonality(): string {
  return [
    'Warm, direct, and practical. Use the caller\'s name when you have it.',
    'Keep responses concise unless detail is requested.',
    'Match urgency: calm for routine calls, fast and direct for emergencies.',
    'No jargon. No exclamation points. No emoji.',
    'Write like a capable operations person, not a brochure.',
  ].join('\n');
}

function sectionServices(config: ClientConfig): string {
  const pricing = config.services.pricing_policy as Record<string, unknown> | undefined;
  const parts = [
    'Services offered:',
    formatServicesList(config),
    '',
    pricing?.quote_over_phone
      ? `Pricing policy: quote_over_phone = ${str(pricing.quote_over_phone)}`
      : '',
    str(pricing?.no_quote_response)
      ? `When asked about price: ${str(pricing.no_quote_response)}`
      : '',
    '',
    'FAQ (preferred wording for awkward questions):',
    config.faq.raw.trim(),
  ];
  return parts.filter(Boolean).join('\n');
}

function sectionRules(config: ClientConfig): string {
  const minNotice = config.services.min_notice_hours;
  const enforcement = config.services.min_notice_enforcement;
  const policies = config.policies.raw.trim();

  return [
    minNotice !== undefined
      ? `Minimum booking notice: ${minNotice} hours (${str(enforcement) || 'as configured'}).`
      : '',
    'For bookable services: tell callers the attendee-facing duration, not the total calendar block.',
    'Weekend slots: by appointment only unless the caller asks.',
    '',
    'Policies:',
    policies,
  ]
    .filter(Boolean)
    .join('\n');
}

function sectionTools(config: ClientConfig): string {
  const tools = getActiveTools(config);
  const notInScope = str(config.moduleConfig.not_in_scope);
  return [
    formatToolsSection(tools),
    '',
    notInScope ? `Out of scope for this deployment (do not offer or promise):\n${notInScope}` : '',
  ]
    .filter(Boolean)
    .join('\n');
}

function sectionEscalation(config: ClientConfig): string {
  const esc = config.compliance.escalation;
  const em = config.compliance.emergency as Record<string, unknown> | undefined;
  const rec = config.compliance.recording as Record<string, unknown> | undefined;

  return [
    'Escalation triggers:',
    formatEscalationTriggers(config),
    '',
    str(esc?.when_it_does_not_know)
      ? `When you do not know: ${str(esc?.when_it_does_not_know)}`
      : '',
    str(esc?.soft_cap_minutes)
      ? `Soft cap: ${str(esc.soft_cap_minutes)} minutes — ${str(esc.at_soft_cap_behavior)}`
      : '',
    str(esc?.hard_cap_minutes)
      ? `Hard cap: ${str(esc.hard_cap_minutes)} minutes — ${str(esc.at_hard_cap_script)}`
      : '',
    '',
    em?.transfer_immediately
      ? `Emergency (transfer immediately): ${str(em.transfer_immediately)}`
      : '',
    str(em?.emergency_script) ? `Emergency script: ${str(em.emergency_script)}` : '',
    str(em?.if_no_one_answers)
      ? `If transfer fails: ${str(em.if_no_one_answers)}`
      : '',
    '',
    rec?.calls_are_recorded
      ? `Recording notice: ${str(rec.notification_script)} (${str(rec.notification_timing)})`
      : '',
    str(rec?.if_caller_declines_recording)
      ? `If caller declines recording: ${str(rec.if_caller_declines_recording)}`
      : '',
    config.vipList ? `\nCall screening / classifier:\n${formatVipList(config)}` : '',
  ]
    .filter(Boolean)
    .join('\n');
}

function sectionBoundaries(config: ClientConfig): string {
  return [
    'Never say or imply:',
    formatNeverSay(config),
    '',
    'Never guess, approximate, or invent facts not in this prompt.',
    'Never share other callers\' information.',
  ].join('\n');
}

export interface AssembledPrompt {
  systemPrompt: string;
  tools: ReturnType<typeof getActiveTools>;
  sections: Record<string, string>;
}

/**
 * Assembles the 7-section system prompt from Shared RAG + vip-list only.
 * Does NOT read module-config.yaml or integrations.yaml content into the prompt
 * (module-config drives tool gating via getActiveTools; integrations is plumbing).
 */
export function assemblePrompt(config: ClientConfig): AssembledPrompt {
  const sections = {
    identity: sectionIdentity(config),
    personality: sectionPersonality(),
    services: sectionServices(config),
    rules: sectionRules(config),
    tools: sectionTools(config),
    escalation: sectionEscalation(config),
    boundaries: sectionBoundaries(config),
  };

  const systemPrompt = [
    block('1. Identity', sections.identity),
    block('2. Personality', sections.personality),
    block('3. Services', sections.services),
    block('4. Rules', sections.rules),
    block('5. Tools', sections.tools),
    block('6. Escalation', sections.escalation),
    block('7. Boundaries', sections.boundaries),
  ].join('\n\n');

  return {
    systemPrompt,
    tools: getActiveTools(config),
    sections,
  };
}
