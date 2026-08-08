import type { Pool } from 'pg';
import type { ClientConfig } from '@receptionist/config';
import {
  createDailyBriefingRecord,
  getLastBriefingDeliveredAt,
  listCallsSince,
  listLeadsSince,
  listPendingBriefingItems,
  markBriefingItemsIncluded,
} from '@receptionist/db';
import { compileDailyBriefing } from './compile.js';
import { briefingWindowStart, parseBriefingSettings } from './settings.js';
import { defaultEmailFrom, sendEmail } from '../smtp.js';

export interface RunDailyBriefingResult {
  ok: boolean;
  skippedReason?: string;
  briefingId?: string;
  recipient?: string;
  itemCount?: number;
  emailSent?: boolean;
}

export async function runDailyBriefing(
  pool: Pool,
  config: ClientConfig,
): Promise<RunDailyBriefingResult> {
  const settings = parseBriefingSettings(config);
  if (!settings || settings.recipients.length === 0) {
    return { ok: false, skippedReason: 'briefing_disabled_or_no_recipients' };
  }

  const clientSlug = config.paths.clientSlug;
  const until = new Date();
  const lastDelivered = await getLastBriefingDeliveredAt(pool, clientSlug);
  const since = briefingWindowStart(lastDelivered, until);

  const [items, leads, calls] = await Promise.all([
    listPendingBriefingItems(pool, clientSlug),
    listLeadsSince(pool, clientSlug, since),
    listCallsSince(pool, clientSlug, since),
  ]);

  const compiled = compileDailyBriefing({
    config,
    since,
    until,
    items,
    leads,
    calls,
  });

  const recipient = settings.recipients[0];
  const emailResult = await sendEmail({
    to: settings.recipients,
    subject: compiled.subject,
    text: compiled.bodyText,
    from: defaultEmailFrom(config),
  });

  const briefingId = await createDailyBriefingRecord(pool, {
    clientSlug,
    recipient,
    subject: compiled.subject,
    bodyText: compiled.bodyText,
    itemCount: compiled.itemCount,
  });

  await markBriefingItemsIncluded(
    pool,
    briefingId,
    items.map((item) => item.id),
  );

  return {
    ok: true,
    briefingId,
    recipient,
    itemCount: compiled.itemCount,
    emailSent: emailResult.sent,
  };
}
