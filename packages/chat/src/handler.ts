import type { Pool } from 'pg';
import type { ClientConfig } from '@receptionist/config';
import type { ClaudeMessage } from '@receptionist/brain';
import { Brain } from '@receptionist/brain';
import {
  checkRateLimit,
  countSessionMessages,
  getSessionByExternalId,
  getSessionMessages,
} from '@receptionist/db';
import type { ChatEnvConfig } from './env.js';
import {
  clientIpFromHeaders,
  isValidEmail,
  normalizeChatMessage,
  rateLimitBucketKeys,
  resolveUserMessage,
} from './env.js';
import type { ChatResponse } from './http.js';

export interface ChatHandlerDeps {
  pool: Pool;
  config: ClientConfig;
  brain: Brain;
  chatEnv: ChatEnvConfig;
}

export interface ChatHandlerInput {
  message: string;
  sessionId: string;
  email: string;
  clientIp: string;
}

export async function handleChatMessage(
  deps: ChatHandlerDeps,
  input: ChatHandlerInput,
): Promise<{ statusCode: number; body: ChatResponse }> {
  const { pool, config, brain, chatEnv } = deps;
  const clientSlug = config.paths.clientSlug;

  if (!config.moduleConfig.modules.web_chat) {
    return {
      statusCode: 503,
      body: {
        reply: 'Web chat is not available right now.',
        leadScore: null,
        action: 'none',
        error: 'module_disabled',
      },
    };
  }

  if (!isValidEmail(input.email)) {
    return {
      statusCode: 400,
      body: {
        reply: 'Please provide a valid email address to continue.',
        leadScore: null,
        action: 'none',
        error: 'missing_email',
      },
    };
  }

  const existing = await getSessionByExternalId(pool, {
    clientSlug,
    channel: 'web_chat',
    externalSessionId: input.sessionId,
  });

  if (
    existing?.visitor_email &&
    existing.visitor_email.toLowerCase() !== input.email
  ) {
    return {
      statusCode: 400,
      body: {
        reply: 'This chat session is linked to a different email address.',
        leadScore: null,
        action: 'none',
        error: 'session_email_mismatch',
      },
    };
  }

  const priorCount = existing
    ? await countSessionMessages(pool, existing.id)
    : 0;
  const normalizedMessage = normalizeChatMessage(input.message);
  const userMessage = resolveUserMessage(normalizedMessage, priorCount);

  if (!userMessage) {
    return {
      statusCode: 400,
      body: {
        reply: 'Please enter a message to continue.',
        leadScore: null,
        action: 'none',
        error: 'missing_message',
      },
    };
  }

  const { sessionKey, ipKey } = rateLimitBucketKeys(
    clientSlug,
    input.sessionId,
    input.clientIp,
  );

  const sessionLimit = await checkRateLimit(pool, {
    bucketKey: sessionKey,
    clientSlug,
    maxMessages: chatEnv.rateLimitMax,
    windowMs: chatEnv.rateLimitWindowMs,
  });

  if (!sessionLimit.allowed) {
    return {
      statusCode: 429,
      body: {
        reply:
          "You're sending messages too quickly. Please wait a bit and try again.",
        leadScore: null,
        action: 'none',
        error: 'rate_limit',
      },
    };
  }

  const ipLimit = await checkRateLimit(pool, {
    bucketKey: ipKey,
    clientSlug,
    maxMessages: chatEnv.rateLimitMax,
    windowMs: chatEnv.rateLimitWindowMs,
  });

  if (!ipLimit.allowed) {
    return {
      statusCode: 429,
      body: {
        reply:
          "You're sending messages too quickly. Please wait a bit and try again.",
        leadScore: null,
        action: 'none',
        error: 'rate_limit',
      },
    };
  }

  const historyRows = existing
    ? await getSessionMessages(pool, existing.id, 20)
    : [];
  const history: ClaudeMessage[] = historyRows
    .filter((row) => row.role === 'user' || row.role === 'assistant')
    .map((row) => ({
      role: row.role as 'user' | 'assistant',
      content: row.content,
    }));

  try {
    const result = await brain.respond({
      channel: 'web_chat',
      sessionId: input.sessionId,
      userMessage,
      history,
      visitorEmail: input.email,
    });

    return {
      statusCode: 200,
      body: {
        reply: result.reply,
        leadScore: result.chat?.leadScore ?? null,
        action: result.chat?.action ?? 'none',
        error: null,
      },
    };
  } catch (err) {
    const message =
      err instanceof Error ? err.message : 'Unexpected chat failure';
    return {
      statusCode: 500,
      body: {
        reply:
          "Sorry, I'm having trouble right now. Please try again in a moment or email us directly.",
        leadScore: null,
        action: 'none',
        error: message.slice(0, 120),
      },
    };
  }
}

export function resolveClientIp(input: {
  remoteAddress?: string;
  forwardedFor?: string;
}): string {
  return clientIpFromHeaders(input.remoteAddress, input.forwardedFor);
}
