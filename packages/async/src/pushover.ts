import type { ClientConfig } from '@receptionist/config';
import { loadAsyncEnv } from './env.js';

export interface PushoverSendInput {
  title: string;
  message: string;
  priority?: number;
  appToken?: string;
  userKey?: string;
}

export interface PushoverSendResult {
  sent: boolean;
  skippedReason?: string;
}

export async function sendPushoverMessage(
  input: PushoverSendInput,
  fetchImpl: typeof fetch = fetch,
): Promise<PushoverSendResult> {
  const env = loadAsyncEnv();
  const appToken = input.appToken ?? env.pushoverAppToken;
  const userKey = input.userKey ?? env.pushoverUserKey;

  if (!appToken || !userKey) {
    return { sent: false, skippedReason: 'pushover_not_configured' };
  }

  const body = new URLSearchParams({
    token: appToken,
    user: userKey,
    title: input.title,
    message: input.message,
    priority: String(input.priority ?? 0),
  });

  const res = await fetchImpl('https://api.pushover.net/1/messages.json', {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body,
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Pushover error ${res.status}: ${text.slice(0, 300)}`);
  }

  return { sent: true };
}

export async function sendEmergencyPushover(
  config: ClientConfig,
  summary: string,
  fetchImpl?: typeof fetch,
): Promise<PushoverSendResult> {
  const identity = config.businessDetails.identity as Record<string, unknown>;
  const businessName = String(identity?.business_name ?? 'Receptionist');
  return sendPushoverMessage(
    {
      title: `${businessName} — Emergency`,
      message: summary,
      priority: 1,
    },
    fetchImpl,
  );
}
