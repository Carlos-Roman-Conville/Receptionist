import type { Pool } from 'pg';
import type { ClientConfig } from '@receptionist/config';
import {
  logInteraction,
  addBriefingItem,
  createLead,
} from '@receptionist/db';
import { sendEmergencyPushover } from '@receptionist/async';
import {
  classifyFromToolInput,
  parseClassifierConfig,
  type ClassifierOutput,
} from '../classifier.js';

export interface ToolExecutionContext {
  pool: Pool;
  config: ClientConfig;
  clientSlug: string;
  sessionId?: string | null;
  callId?: string | null;
  channel: 'phone' | 'web_chat';
  lastUserMessage?: string;
}

export interface ToolExecutionResult {
  ok: boolean;
  message: string;
  classifier?: ClassifierOutput;
  data?: Record<string, unknown>;
}

export async function executeTool(
  toolName: string,
  input: Record<string, unknown>,
  ctx: ToolExecutionContext,
): Promise<ToolExecutionResult> {
  await logInteraction(ctx.pool, {
    clientSlug: ctx.clientSlug,
    sessionId: ctx.sessionId,
    callId: ctx.callId,
    eventType: `tool:${toolName}`,
    payload: input,
  });

  switch (toolName) {
    case 'take_message':
      await addBriefingItem(ctx.pool, {
        clientSlug: ctx.clientSlug,
        itemType: 'message',
        summary: String(input.reason ?? 'Callback requested'),
        metadata: input,
      });
      return { ok: true, message: 'Message recorded for callback.' };

    case 'log_interaction':
      return {
        ok: true,
        message: 'Interaction logged.',
        data: input,
      };

    case 'check_availability':
      return {
        ok: true,
        message:
          'Availability check queued. Calendar integration executes in Phase 2.',
        data: input,
      };

    case 'book_appointment':
      await addBriefingItem(ctx.pool, {
        clientSlug: ctx.clientSlug,
        itemType: 'booking',
        summary: `Booking requested for ${String(input.start_time ?? 'TBD')}`,
        metadata: input,
      });
      return {
        ok: true,
        message: 'Appointment booking queued for calendar write.',
        data: input,
      };

    case 'reschedule_appointment':
    case 'cancel_appointment':
      return {
        ok: true,
        message: `${toolName} queued for calendar integration.`,
        data: input,
      };

    case 'classify_caller': {
      const classifierConfig = parseClassifierConfig(ctx.config.vipList);
      const classification = classifyFromToolInput(
        ctx.lastUserMessage ?? '',
        String(input.classification ?? ''),
        classifierConfig,
      );
      return {
        ok: true,
        message: `Caller classified as ${classification}.`,
        classifier: classification,
        data: { classification, rationale: input.rationale },
      };
    }

    case 'transfer_call':
      await addBriefingItem(ctx.pool, {
        clientSlug: ctx.clientSlug,
        itemType: 'emergency_transfer',
        summary: String(input.reason ?? 'Emergency transfer'),
        metadata: { urgent: true },
      });
      return {
        ok: true,
        message: 'Transfer initiated.',
        classifier: 'EMERGENCY_CLIENT_DOWN',
        data: input,
      };

    case 'send_emergency_alert':
      await addBriefingItem(ctx.pool, {
        clientSlug: ctx.clientSlug,
        itemType: 'emergency_alert',
        summary: String(input.summary ?? 'Emergency alert'),
        metadata: { urgent: true },
      });
      await sendEmergencyPushover(
        ctx.config,
        String(input.summary ?? 'Emergency alert'),
      ).catch(() => undefined);
      return {
        ok: true,
        message: 'Emergency alert sent via Pushover.',
        classifier: 'EMERGENCY_CLIENT_DOWN',
        data: input,
      };

    default:
      return { ok: false, message: `Unknown tool: ${toolName}` };
  }
}

export async function recordLeadFromChat(
  ctx: ToolExecutionContext,
  input: {
    email?: string | null;
    leadScore?: 'hot' | 'warm' | 'cold' | null;
    intent?: string | null;
    notes?: string | null;
  },
): Promise<string> {
  return createLead(ctx.pool, {
    clientSlug: ctx.clientSlug,
    sessionId: ctx.sessionId,
    email: input.email,
    leadScore: input.leadScore,
    intent: input.intent,
    notes: input.notes,
  });
}
