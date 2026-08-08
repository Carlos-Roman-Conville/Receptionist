import type { ClientConfig } from '@receptionist/config';
import { loadAsyncEnv } from '../env.js';

export interface BriefingSettings {
  enabled: boolean;
  deliveryTime: string;
  recipients: string[];
}

export function parseBriefingSettings(config: ClientConfig): BriefingSettings | null {
  if (!config.moduleConfig.modules.daily_briefing) {
    return null;
  }

  const settings = (
    config.moduleConfig.settings as { daily_briefing?: Record<string, unknown> }
  )?.daily_briefing;

  const env = loadAsyncEnv();
  const rawRecipients = String(settings?.recipients ?? env.defaultNotifyEmail ?? '');
  const recipients = rawRecipients
    .split(',')
    .map((value) => value.trim())
    .filter(Boolean);

  return {
    enabled: true,
    deliveryTime: String(settings?.delivery_time ?? '06:30'),
    recipients,
  };
}

export function businessDisplayName(config: ClientConfig): string {
  const identity = config.businessDetails.identity as Record<string, unknown>;
  return String(identity?.business_name ?? 'Receptionist');
}

export function businessTimezone(config: ClientConfig): string {
  const hours = config.businessDetails.hours as { timezone?: string };
  return hours?.timezone ?? 'America/New_York';
}

export function briefingWindowStart(lastDeliveredAt: Date | null, now = new Date()): Date {
  if (lastDeliveredAt) return lastDeliveredAt;
  const since = new Date(now);
  since.setHours(since.getHours() - 24);
  return since;
}

export function formatBriefingTimestamp(date: Date, timeZone: string): string {
  return new Intl.DateTimeFormat('en-US', {
    dateStyle: 'medium',
    timeStyle: 'short',
    timeZone,
  }).format(date);
}
