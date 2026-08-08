import type { Pool } from 'pg';
import type { ClientConfig } from '@receptionist/config';
import { sendEmail, defaultEmailFrom } from '@receptionist/async';
import { addBriefingItem, checkRateLimit, logInteraction } from '@receptionist/db';
import type { ChatEnvConfig } from './env.js';
import { isValidEmail } from './env.js';

export interface ContactRequestBody {
  name?: unknown;
  email?: unknown;
  message?: unknown;
  website?: unknown;
  timestamp?: unknown;
}

export interface ContactSuccessResponse {
  ok: true;
  error: null;
}

export interface ContactErrorResponse {
  ok: false;
  error: string;
  message: string;
}

export type ContactResponse = ContactSuccessResponse | ContactErrorResponse;

export function parseContactRequestBody(body: ContactRequestBody): {
  name: string;
  email: string;
  message: string;
  honeypot: string;
} | null {
  if (typeof body.website === 'string' && body.website.trim()) {
    return null;
  }

  const name = typeof body.name === 'string' ? body.name.trim() : '';
  const email =
    typeof body.email === 'string' ? body.email.trim().toLowerCase() : '';
  const message = typeof body.message === 'string' ? body.message.trim() : '';
  const honeypot = typeof body.website === 'string' ? body.website.trim() : '';

  if (!name || !email || !message || !isValidEmail(email)) {
    return null;
  }

  return { name, email, message, honeypot };
}

export async function handleContactForm(
  deps: {
    pool: Pool;
    config: ClientConfig;
    chatEnv: ChatEnvConfig;
  },
  input: {
    name: string;
    email: string;
    message: string;
    clientIp: string;
  },
): Promise<{ statusCode: number; body: ContactResponse }> {
  const { pool, config, chatEnv } = deps;
  const clientSlug = config.paths.clientSlug;

  const ipKey = `contact:ip:${clientSlug}:${input.clientIp}`;
  const limit = await checkRateLimit(pool, {
    bucketKey: ipKey,
    clientSlug,
    maxMessages: 5,
    windowMs: 3_600_000,
  });

  if (!limit.allowed) {
    return {
      statusCode: 429,
      body: {
        ok: false,
        error: 'rate_limit',
        message: 'Too many submissions. Please try again later.',
      },
    };
  }

  const summary = `Contact form: ${input.name} <${input.email}> — ${input.message.slice(0, 160)}`;

  await addBriefingItem(pool, {
    clientSlug,
    itemType: 'contact_form',
    summary,
    metadata: {
      name: input.name,
      email: input.email,
      message: input.message,
    },
  });

  await logInteraction(pool, {
    clientSlug,
    eventType: 'contact_form',
    payload: {
      name: input.name,
      email: input.email,
      messageLength: input.message.length,
    },
  });

  const settings = (
    config.moduleConfig.settings as { daily_briefing?: { recipients?: string } }
  )?.daily_briefing;
  const recipients = String(settings?.recipients ?? process.env.LEAD_NOTIFY_EMAIL ?? '')
    .split(',')
    .map((value) => value.trim())
    .filter(Boolean);

  if (recipients.length > 0) {
    const identity = config.businessDetails.identity as Record<string, unknown>;
    const businessName = String(identity?.business_name ?? 'Receptionist');
    await sendEmail({
      to: recipients,
      subject: `${businessName} — Contact form`,
      text: [
        'New contact form submission',
        `Name: ${input.name}`,
        `Email: ${input.email}`,
        '',
        input.message,
      ].join('\n'),
      from: defaultEmailFrom(config),
    }).catch(() => undefined);
  }

  return {
    statusCode: 200,
    body: { ok: true, error: null },
  };
}
