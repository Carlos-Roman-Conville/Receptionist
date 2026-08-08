export interface ChatEnvConfig {
  port: number;
  host: string;
  allowedOrigins: string[];
  allowNoOrigin: boolean;
  rateLimitMax: number;
  rateLimitWindowMs: number;
}

function parseOrigins(raw: string | undefined): string[] {
  if (!raw) return [];
  return raw
    .split(',')
    .map((value) => value.trim())
    .filter(Boolean);
}

export function loadChatEnv(): ChatEnvConfig {
  return {
    port: Number(process.env.CHAT_PORT ?? 3000),
    host: process.env.CHAT_HOST ?? '0.0.0.0',
    allowedOrigins: parseOrigins(process.env.CHAT_ALLOWED_ORIGINS),
    allowNoOrigin: process.env.CHAT_ALLOW_NO_ORIGIN === '1',
    rateLimitMax: Number(process.env.CHAT_RATE_LIMIT_MAX ?? 20),
    rateLimitWindowMs: Number(process.env.CHAT_RATE_LIMIT_WINDOW_MS ?? 3_600_000),
  };
}

export function isOriginAllowed(
  origin: string | undefined,
  config: Pick<ChatEnvConfig, 'allowedOrigins' | 'allowNoOrigin'>,
): boolean {
  if (!origin) {
    return config.allowNoOrigin;
  }
  return config.allowedOrigins.includes(origin);
}

export function isValidEmail(email: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

export function normalizeChatMessage(message: unknown): string {
  if (typeof message !== 'string') return '';
  return message.trim();
}

export const SESSION_START_MESSAGE = '(Visitor opened chat.)';

export function resolveUserMessage(
  message: string,
  priorMessageCount: number,
): string | null {
  if (message) return message;
  if (priorMessageCount === 0) return SESSION_START_MESSAGE;
  return null;
}

export function clientIpFromHeaders(
  remoteAddress: string | undefined,
  forwardedFor: string | undefined,
): string {
  if (forwardedFor) {
    return forwardedFor.split(',')[0]?.trim() || 'unknown';
  }
  return remoteAddress ?? 'unknown';
}

export function rateLimitBucketKeys(
  clientSlug: string,
  sessionId: string,
  ip: string,
): { sessionKey: string; ipKey: string } {
  return {
    sessionKey: `chat:session:${clientSlug}:${sessionId}`,
    ipKey: `chat:ip:${clientSlug}:${ip}`,
  };
}
