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
} from '../classifier.js';
import {
  bookAppointment,
  cancelAppointment,
  checkAvailability,
  rescheduleAppointment,
} from '../calendar/booking.js';
import type { ToolExecutionContext, ToolExecutionResult } from './types.js';

export type { ToolExecutionContext, ToolExecutionResult } from './types.js';

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
      return checkAvailability(ctx, input);

    case 'book_appointment':
      return bookAppointment(ctx, input);

    case 'reschedule_appointment':
      return rescheduleAppointment(ctx, input);

    case 'cancel_appointment':
      return cancelAppointment(ctx, input);

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
