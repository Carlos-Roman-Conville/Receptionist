import type {
  BriefingItemRow,
  CallSummaryRow,
  LeadRow,
} from '@receptionist/db';
import type { ClientConfig } from '@receptionist/config';
import {
  businessDisplayName,
  businessTimezone,
  formatBriefingTimestamp,
} from './settings.js';

export interface CompiledBriefing {
  subject: string;
  bodyText: string;
  itemCount: number;
}

function section(title: string, lines: string[]): string {
  if (lines.length === 0) {
    return `${title}\n(none)\n`;
  }
  return `${title}\n${lines.join('\n')}\n`;
}

function formatBriefingItem(item: BriefingItemRow): string {
  const when = formatBriefingTimestamp(item.occurred_at, 'UTC');
  return `- [${item.item_type}] ${item.summary} (${when})`;
}

function formatLead(lead: LeadRow): string {
  const parts = [
    lead.lead_score ? `score=${lead.lead_score}` : null,
    lead.intent ? `intent=${lead.intent}` : null,
    lead.email ? `email=${lead.email}` : null,
    lead.phone ? `phone=${lead.phone}` : null,
    lead.notes ? `notes=${lead.notes}` : null,
  ].filter(Boolean);
  return `- ${parts.join(' | ')}`;
}

function formatCall(call: CallSummaryRow, timeZone: string): string {
  const when = formatBriefingTimestamp(call.started_at, timeZone);
  const parts = [
    call.caller_number ? `from ${call.caller_number}` : 'unknown caller',
    call.classifier_result ? `class=${call.classifier_result}` : null,
    call.outcome ? `outcome=${call.outcome}` : null,
    call.recording_declined ? 'recording declined' : null,
    call.duration_seconds != null ? `${call.duration_seconds}s` : null,
  ].filter(Boolean);
  return `- ${when}: ${parts.join(', ')}`;
}

export function compileDailyBriefing(input: {
  config: ClientConfig;
  since: Date;
  until: Date;
  items: BriefingItemRow[];
  leads: LeadRow[];
  calls: CallSummaryRow[];
}): CompiledBriefing {
  const name = businessDisplayName(input.config);
  const timeZone = businessTimezone(input.config);
  const sinceLabel = formatBriefingTimestamp(input.since, timeZone);
  const untilLabel = formatBriefingTimestamp(input.until, timeZone);

  const bodyText = [
    `${name} — daily briefing`,
    `Period: ${sinceLabel} → ${untilLabel}`,
    '',
    section('Queued items', input.items.map(formatBriefingItem)),
    section('New leads', input.leads.map(formatLead)),
    section('Calls', input.calls.map((call) => formatCall(call, timeZone))),
  ].join('\n');

  return {
    subject: `${name} — Daily briefing`,
    bodyText,
    itemCount: input.items.length + input.leads.length + input.calls.length,
  };
}

export function compileLeadNotification(input: {
  config: ClientConfig;
  lead: LeadRow;
  lastMessage?: string | null;
  sessionId?: string | null;
}): { subject: string; text: string } {
  const name = businessDisplayName(input.config);
  const lines = [
    `New ${input.lead.lead_score ?? 'unknown'} lead`,
    input.lead.email ? `Email: ${input.lead.email}` : null,
    input.lead.intent ? `Intent: ${input.lead.intent}` : null,
    input.lead.notes ? `Notes: ${input.lead.notes}` : null,
    input.lastMessage ? `Last message: ${input.lastMessage}` : null,
    input.sessionId ? `Session: ${input.sessionId}` : null,
  ].filter(Boolean);

  return {
    subject: `${name} — ${input.lead.lead_score ?? 'New'} web chat lead`,
    text: lines.join('\n'),
  };
}
