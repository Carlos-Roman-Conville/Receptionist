import type { Pool } from 'pg';

export type SessionChannel = 'phone' | 'web_chat';

export interface SessionRow {
  id: string;
  client_slug: string;
  channel: SessionChannel;
  external_session_id: string;
  visitor_email: string | null;
  caller_phone: string | null;
}

export async function upsertSession(
  pool: Pool,
  input: {
    clientSlug: string;
    channel: SessionChannel;
    externalSessionId: string;
    visitorEmail?: string | null;
    callerPhone?: string | null;
  },
): Promise<SessionRow> {
  const result = await pool.query<SessionRow>(
    `INSERT INTO sessions (client_slug, channel, external_session_id, visitor_email, caller_phone)
     VALUES ($1, $2, $3, $4, $5)
     ON CONFLICT (client_slug, channel, external_session_id)
     DO UPDATE SET
       visitor_email = COALESCE(EXCLUDED.visitor_email, sessions.visitor_email),
       caller_phone = COALESCE(EXCLUDED.caller_phone, sessions.caller_phone)
     RETURNING id, client_slug, channel, external_session_id, visitor_email, caller_phone`,
    [
      input.clientSlug,
      input.channel,
      input.externalSessionId,
      input.visitorEmail ?? null,
      input.callerPhone ?? null,
    ],
  );
  return result.rows[0];
}

export async function getSessionByExternalId(
  pool: Pool,
  input: {
    clientSlug: string;
    channel: SessionChannel;
    externalSessionId: string;
  },
): Promise<SessionRow | null> {
  const result = await pool.query<SessionRow>(
    `SELECT id, client_slug, channel, external_session_id, visitor_email, caller_phone
     FROM sessions
     WHERE client_slug = $1 AND channel = $2 AND external_session_id = $3`,
    [input.clientSlug, input.channel, input.externalSessionId],
  );
  return result.rows[0] ?? null;
}

export async function countSessionMessages(
  pool: Pool,
  sessionId: string,
): Promise<number> {
  const result = await pool.query<{ count: string }>(
    `SELECT COUNT(*)::text AS count FROM messages WHERE session_id = $1`,
    [sessionId],
  );
  return Number(result.rows[0]?.count ?? 0);
}

export interface CallRow {
  id: string;
  client_slug: string;
  session_id: string | null;
  telnyx_call_control_id: string | null;
  caller_number: string | null;
  direction: string;
  recording_declined: boolean;
  classifier_result: string | null;
  outcome: string | null;
}

export async function createCall(
  pool: Pool,
  input: {
    clientSlug: string;
    sessionId?: string | null;
    telnyxCallControlId: string;
    callerNumber?: string | null;
    direction?: string;
    metadata?: Record<string, unknown>;
  },
): Promise<CallRow> {
  const result = await pool.query<CallRow>(
    `INSERT INTO calls (client_slug, session_id, telnyx_call_control_id, caller_number, direction, metadata)
     VALUES ($1, $2, $3, $4, $5, $6)
     RETURNING id, client_slug, session_id, telnyx_call_control_id, caller_number, direction,
               recording_declined, classifier_result, outcome`,
    [
      input.clientSlug,
      input.sessionId ?? null,
      input.telnyxCallControlId,
      input.callerNumber ?? null,
      input.direction ?? 'inbound',
      JSON.stringify(input.metadata ?? {}),
    ],
  );
  return result.rows[0];
}

export async function getCallByTelnyxControlId(
  pool: Pool,
  telnyxCallControlId: string,
): Promise<CallRow | null> {
  const result = await pool.query<CallRow>(
    `SELECT id, client_slug, session_id, telnyx_call_control_id, caller_number, direction,
            recording_declined, classifier_result, outcome
     FROM calls WHERE telnyx_call_control_id = $1`,
    [telnyxCallControlId],
  );
  return result.rows[0] ?? null;
}

export async function updateCall(
  pool: Pool,
  callId: string,
  input: {
    sessionId?: string | null;
    recordingDeclined?: boolean;
    classifierResult?: string | null;
    outcome?: string | null;
    metadata?: Record<string, unknown>;
  },
): Promise<void> {
  const fields: string[] = [];
  const values: unknown[] = [callId];
  let idx = 2;

  if (input.sessionId !== undefined) {
    fields.push(`session_id = $${idx++}`);
    values.push(input.sessionId);
  }
  if (input.recordingDeclined !== undefined) {
    fields.push(`recording_declined = $${idx++}`);
    values.push(input.recordingDeclined);
  }
  if (input.classifierResult !== undefined) {
    fields.push(`classifier_result = $${idx++}`);
    values.push(input.classifierResult);
  }
  if (input.outcome !== undefined) {
    fields.push(`outcome = $${idx++}`);
    values.push(input.outcome);
  }
  if (input.metadata !== undefined) {
    fields.push(`metadata = metadata || $${idx++}::jsonb`);
    values.push(JSON.stringify(input.metadata));
  }

  if (fields.length === 0) return;

  await pool.query(
    `UPDATE calls SET ${fields.join(', ')} WHERE id = $1`,
    values,
  );
}

export async function endCall(
  pool: Pool,
  callId: string,
  input?: { outcome?: string | null; durationSeconds?: number },
): Promise<void> {
  await pool.query(
    `UPDATE calls
     SET ended_at = NOW(),
         duration_seconds = COALESCE($2, EXTRACT(EPOCH FROM (NOW() - started_at))::int),
         outcome = COALESCE($3, outcome)
     WHERE id = $1`,
    [callId, input?.durationSeconds ?? null, input?.outcome ?? null],
  );
}

export async function appendMessage(
  pool: Pool,
  sessionId: string,
  role: 'user' | 'assistant' | 'system' | 'tool',
  content: string,
): Promise<void> {
  await pool.query(
    `INSERT INTO messages (session_id, role, content) VALUES ($1, $2, $3)`,
    [sessionId, role, content],
  );
}

export async function getSessionMessages(
  pool: Pool,
  sessionId: string,
  limit = 20,
): Promise<Array<{ role: string; content: string }>> {
  const result = await pool.query<{ role: string; content: string }>(
    `SELECT role, content FROM messages
     WHERE session_id = $1
     ORDER BY created_at ASC
     LIMIT $2`,
    [sessionId, limit],
  );
  return result.rows;
}

export async function logInteraction(
  pool: Pool,
  input: {
    clientSlug: string;
    sessionId?: string | null;
    callId?: string | null;
    eventType: string;
    payload?: Record<string, unknown>;
  },
): Promise<void> {
  await pool.query(
    `INSERT INTO interaction_logs (client_slug, session_id, call_id, event_type, payload)
     VALUES ($1, $2, $3, $4, $5)`,
    [
      input.clientSlug,
      input.sessionId ?? null,
      input.callId ?? null,
      input.eventType,
      JSON.stringify(input.payload ?? {}),
    ],
  );
}

export async function createLead(
  pool: Pool,
  input: {
    clientSlug: string;
    sessionId?: string | null;
    email?: string | null;
    phone?: string | null;
    leadScore?: 'hot' | 'warm' | 'cold' | null;
    intent?: string | null;
    notes?: string | null;
    metadata?: Record<string, unknown>;
  },
): Promise<string> {
  const result = await pool.query<{ id: string }>(
    `INSERT INTO leads (client_slug, session_id, email, phone, lead_score, intent, notes, metadata)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
     RETURNING id`,
    [
      input.clientSlug,
      input.sessionId ?? null,
      input.email ?? null,
      input.phone ?? null,
      input.leadScore ?? null,
      input.intent ?? null,
      input.notes ?? null,
      JSON.stringify(input.metadata ?? {}),
    ],
  );
  return result.rows[0].id;
}

export async function addBriefingItem(
  pool: Pool,
  input: {
    clientSlug: string;
    itemType: string;
    summary: string;
    occurredAt?: Date;
    metadata?: Record<string, unknown>;
  },
): Promise<void> {
  await pool.query(
    `INSERT INTO daily_briefing_items (client_slug, item_type, summary, occurred_at, metadata)
     VALUES ($1, $2, $3, $4, $5)`,
    [
      input.clientSlug,
      input.itemType,
      input.summary,
      input.occurredAt ?? new Date(),
      JSON.stringify(input.metadata ?? {}),
    ],
  );
}

export async function checkRateLimit(
  pool: Pool,
  input: {
    bucketKey: string;
    clientSlug: string;
    maxMessages: number;
    windowMs: number;
  },
): Promise<{ allowed: boolean; count: number }> {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const existing = await client.query<{
      message_count: number;
      window_start: Date;
    }>(
      `SELECT message_count, window_start FROM rate_limit_buckets WHERE bucket_key = $1 FOR UPDATE`,
      [input.bucketKey],
    );

    const now = Date.now();
    if (existing.rows.length === 0) {
      await client.query(
        `INSERT INTO rate_limit_buckets (bucket_key, client_slug, message_count, window_start)
         VALUES ($1, $2, 1, NOW())`,
        [input.bucketKey, input.clientSlug],
      );
      await client.query('COMMIT');
      return { allowed: true, count: 1 };
    }

    const row = existing.rows[0];
    const windowStart = new Date(row.window_start).getTime();
    if (now - windowStart > input.windowMs) {
      await client.query(
        `UPDATE rate_limit_buckets SET message_count = 1, window_start = NOW() WHERE bucket_key = $1`,
        [input.bucketKey],
      );
      await client.query('COMMIT');
      return { allowed: true, count: 1 };
    }

    const nextCount = row.message_count + 1;
    if (nextCount > input.maxMessages) {
      await client.query('COMMIT');
      return { allowed: false, count: row.message_count };
    }

    await client.query(
      `UPDATE rate_limit_buckets SET message_count = $2 WHERE bucket_key = $1`,
      [input.bucketKey, nextCount],
    );
    await client.query('COMMIT');
    return { allowed: true, count: nextCount };
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

export interface BriefingItemRow {
  id: string;
  client_slug: string;
  item_type: string;
  summary: string;
  occurred_at: Date;
  metadata: Record<string, unknown>;
}

export interface LeadRow {
  id: string;
  client_slug: string;
  session_id: string | null;
  email: string | null;
  phone: string | null;
  lead_score: string | null;
  intent: string | null;
  notes: string | null;
  status: string;
  created_at: Date;
}

export interface CallSummaryRow {
  id: string;
  caller_number: string | null;
  started_at: Date;
  duration_seconds: number | null;
  classifier_result: string | null;
  outcome: string | null;
  recording_declined: boolean;
}

export interface DailyBriefingRow {
  id: string;
  client_slug: string;
  delivered_at: Date;
  recipient: string;
  subject: string;
  body_text: string;
  item_count: number;
}

export async function listPendingBriefingItems(
  pool: Pool,
  clientSlug: string,
): Promise<BriefingItemRow[]> {
  const result = await pool.query<{
    id: string;
    client_slug: string;
    item_type: string;
    summary: string;
    occurred_at: Date;
    metadata: Record<string, unknown> | string;
  }>(
    `SELECT id, client_slug, item_type, summary, occurred_at, metadata
     FROM daily_briefing_items
     WHERE client_slug = $1 AND included_in_briefing_id IS NULL
     ORDER BY occurred_at ASC`,
    [clientSlug],
  );
  return result.rows.map((row) => ({
    id: row.id,
    client_slug: row.client_slug,
    item_type: row.item_type,
    summary: row.summary,
    occurred_at: row.occurred_at,
    metadata:
      typeof row.metadata === 'string'
        ? (JSON.parse(row.metadata) as Record<string, unknown>)
        : (row.metadata ?? {}),
  }));
}

export async function listLeadsSince(
  pool: Pool,
  clientSlug: string,
  since: Date,
): Promise<LeadRow[]> {
  const result = await pool.query<LeadRow>(
    `SELECT id, client_slug, session_id, email, phone, lead_score, intent, notes, status, created_at
     FROM leads
     WHERE client_slug = $1 AND created_at >= $2
     ORDER BY created_at ASC`,
    [clientSlug, since],
  );
  return result.rows;
}

export async function listUnnotifiedLeads(
  pool: Pool,
  clientSlug: string,
): Promise<LeadRow[]> {
  const result = await pool.query<LeadRow>(
    `SELECT id, client_slug, session_id, email, phone, lead_score, intent, notes, status, created_at
     FROM leads
     WHERE client_slug = $1 AND status = 'new'
       AND lead_score IN ('hot', 'warm')
     ORDER BY created_at ASC`,
    [clientSlug],
  );
  return result.rows;
}

export async function markLeadNotified(pool: Pool, leadId: string): Promise<void> {
  await pool.query(`UPDATE leads SET status = 'notified' WHERE id = $1`, [leadId]);
}

export async function listCallsSince(
  pool: Pool,
  clientSlug: string,
  since: Date,
): Promise<CallSummaryRow[]> {
  const result = await pool.query<CallSummaryRow>(
    `SELECT id, caller_number, started_at, duration_seconds, classifier_result, outcome, recording_declined
     FROM calls
     WHERE client_slug = $1 AND started_at >= $2
     ORDER BY started_at ASC`,
    [clientSlug, since],
  );
  return result.rows;
}

export async function getLastBriefingDeliveredAt(
  pool: Pool,
  clientSlug: string,
): Promise<Date | null> {
  const result = await pool.query<{ delivered_at: Date }>(
    `SELECT delivered_at FROM daily_briefings
     WHERE client_slug = $1
     ORDER BY delivered_at DESC
     LIMIT 1`,
    [clientSlug],
  );
  return result.rows[0]?.delivered_at ?? null;
}

export async function createDailyBriefingRecord(
  pool: Pool,
  input: {
    clientSlug: string;
    recipient: string;
    subject: string;
    bodyText: string;
    itemCount: number;
  },
): Promise<string> {
  const result = await pool.query<{ id: string }>(
    `INSERT INTO daily_briefings (client_slug, recipient, subject, body_text, item_count)
     VALUES ($1, $2, $3, $4, $5)
     RETURNING id`,
    [
      input.clientSlug,
      input.recipient,
      input.subject,
      input.bodyText,
      input.itemCount,
    ],
  );
  return result.rows[0].id;
}

export async function markBriefingItemsIncluded(
  pool: Pool,
  briefingId: string,
  itemIds: string[],
): Promise<void> {
  if (itemIds.length === 0) return;
  await pool.query(
    `UPDATE daily_briefing_items
     SET included_in_briefing_id = $1
     WHERE id = ANY($2::uuid[])`,
    [briefingId, itemIds],
  );
}
