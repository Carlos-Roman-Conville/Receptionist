export interface AsyncEnvConfig {
  port: number;
  host: string;
  webhookSecret: string;
  pushoverAppToken: string;
  pushoverUserKey: string;
  smtpHost: string;
  smtpPort: number;
  smtpUser: string;
  smtpPass: string;
  defaultNotifyEmail: string;
}

export function loadAsyncEnv(): AsyncEnvConfig {
  return {
    port: Number(process.env.ASYNC_PORT ?? 3002),
    host: process.env.ASYNC_HOST ?? '0.0.0.0',
    webhookSecret: process.env.ASYNC_WEBHOOK_SECRET ?? '',
    pushoverAppToken: process.env.PUSHOVER_APP_TOKEN ?? '',
    pushoverUserKey: process.env.PUSHOVER_USER_KEY ?? '',
    smtpHost: process.env.SMTP_HOST ?? '',
    smtpPort: Number(process.env.SMTP_PORT ?? 587),
    smtpUser: process.env.SMTP_USER ?? '',
    smtpPass: process.env.SMTP_PASS ?? '',
    defaultNotifyEmail: process.env.LEAD_NOTIFY_EMAIL ?? '',
  };
}

export function resolveEnvReference(value: string): string | null {
  if (value.startsWith('env:')) {
    return process.env[value.slice(4)] ?? null;
  }
  if (value.startsWith('<<') || !value.trim()) {
    return null;
  }
  return value;
}
