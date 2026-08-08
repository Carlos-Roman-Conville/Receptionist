import type { Pool } from 'pg';
import type { ClientConfig } from '@receptionist/config';
import {
  getSessionMessages,
  listUnnotifiedLeads,
  markLeadNotified,
} from '@receptionist/db';
import { compileLeadNotification } from '../briefing/compile.js';
import { parseBriefingSettings } from '../briefing/settings.js';
import { loadAsyncEnv } from '../env.js';
import { defaultEmailFrom, sendEmail } from '../smtp.js';

export interface NotifyLeadsResult {
  processed: number;
  sent: number;
  skipped: number;
}

export async function notifyPendingLeads(
  pool: Pool,
  config: ClientConfig,
): Promise<NotifyLeadsResult> {
  const settings = parseBriefingSettings(config);
  const env = loadAsyncEnv();
  const recipients = settings?.recipients.length
    ? settings.recipients
    : [env.defaultNotifyEmail].filter(Boolean);

  if (recipients.length === 0) {
    return { processed: 0, sent: 0, skipped: 0 };
  }

  const leads = await listUnnotifiedLeads(pool, config.paths.clientSlug);
  let sent = 0;
  let skipped = 0;

  for (const lead of leads) {
    let lastMessage: string | null = null;
    if (lead.session_id) {
      const messages = await getSessionMessages(pool, lead.session_id, 5);
      const lastUser = [...messages].reverse().find((m) => m.role === 'user');
      lastMessage = lastUser?.content ?? null;
    }

    const compiled = compileLeadNotification({
      config,
      lead,
      lastMessage,
      sessionId: lead.session_id,
    });

    const result = await sendEmail({
      to: recipients,
      subject: compiled.subject,
      text: compiled.text,
      from: defaultEmailFrom(config),
    });

    if (result.sent) {
      await markLeadNotified(pool, lead.id);
      sent += 1;
    } else {
      skipped += 1;
    }
  }

  return { processed: leads.length, sent, skipped };
}
