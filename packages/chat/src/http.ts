import type { FastifyReply, FastifyRequest } from 'fastify';
import type { ChatEnvConfig } from './env.js';
import { isOriginAllowed } from './env.js';

export interface ChatRequestBody {
  message?: unknown;
  sessionId?: unknown;
  email?: unknown;
  timestamp?: unknown;
  messageCount?: unknown;
}

export interface ChatSuccessResponse {
  reply: string;
  leadScore: 'hot' | 'warm' | 'cold' | null;
  action: string | null;
  error: null;
}

export interface ChatErrorResponse {
  reply: string;
  leadScore: null;
  action: 'none';
  error: string;
}

export type ChatResponse = ChatSuccessResponse | ChatErrorResponse;

export function sendChatError(
  reply: FastifyReply,
  statusCode: number,
  error: string,
  replyText: string,
): FastifyReply {
  return reply.status(statusCode).send({
    reply: replyText,
    leadScore: null,
    action: 'none',
    error,
  } satisfies ChatErrorResponse);
}

export function validateOriginHeader(
  request: FastifyRequest,
  chatEnv: Pick<ChatEnvConfig, 'allowedOrigins' | 'allowNoOrigin'>,
): boolean {
  const origin = request.headers.origin;
  return isOriginAllowed(origin, chatEnv);
}

export function parseChatRequestBody(body: ChatRequestBody): {
  message: string;
  sessionId: string;
  email: string;
} | null {
  const email =
    typeof body.email === 'string' ? body.email.trim().toLowerCase() : '';
  const sessionId =
    typeof body.sessionId === 'string' ? body.sessionId.trim() : '';
  const message = typeof body.message === 'string' ? body.message : '';

  if (!email || !sessionId) {
    return null;
  }

  return { message, sessionId, email };
}
