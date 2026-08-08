import Fastify, { type FastifyReply, type FastifyRequest } from 'fastify';
import type { Pool } from 'pg';
import type { ClientConfig } from '@receptionist/config';
import { Brain } from '@receptionist/brain';
import type { ChatEnvConfig } from './env.js';
import {
  parseContactRequestBody,
  handleContactForm,
  type ContactRequestBody,
} from './contact.js';
import { handleChatMessage, resolveClientIp } from './handler.js';
import {
  parseChatRequestBody,
  sendChatError,
  validateOriginHeader,
  type ChatRequestBody,
} from './http.js';

export interface CreateChatServerOptions {
  pool: Pool;
  config: ClientConfig;
  chatEnv: ChatEnvConfig;
  brain?: Brain;
}

export function createChatServer(options: CreateChatServerOptions) {
  const brain =
    options.brain ??
    new Brain({ config: options.config, pool: options.pool });
  const chatEnv = options.chatEnv;

  const app = Fastify({
    logger: true,
    trustProxy: true,
  });

  app.get('/health', async () => ({
    ok: true,
    service: 'chat',
    client: options.config.paths.clientSlug,
    webChatEnabled: options.config.moduleConfig.modules.web_chat === true,
  }));

  const chatRoute = async (
    request: FastifyRequest<{ Body: ChatRequestBody }>,
    reply: FastifyReply,
  ) => {
    if (!validateOriginHeader(request, chatEnv)) {
      return sendChatError(
        reply,
        403,
        'forbidden_origin',
        'This chat is not available from your browser origin.',
      );
    }

    const parsed = parseChatRequestBody(request.body ?? {});
    if (!parsed) {
      return sendChatError(
        reply,
        400,
        'missing_email',
        'Please provide a valid email address to continue.',
      );
    }

    const forwardedFor =
      typeof request.headers['x-forwarded-for'] === 'string'
        ? request.headers['x-forwarded-for']
        : undefined;

    const result = await handleChatMessage(
      {
        pool: options.pool,
        config: options.config,
        brain,
        chatEnv,
      },
      {
        ...parsed,
        clientIp: resolveClientIp({
          remoteAddress: request.ip,
          forwardedFor,
        }),
      },
    );

    return reply.status(result.statusCode).send(result.body);
  };

  app.post('/chat', chatRoute);
  app.post('/webhook/chat', chatRoute);

  const contactRoute = async (
    request: FastifyRequest<{ Body: ContactRequestBody }>,
    reply: FastifyReply,
  ) => {
    if (!validateOriginHeader(request, chatEnv)) {
      return reply.status(403).send({
        ok: false,
        error: 'forbidden_origin',
        message: 'This form is not available from your browser origin.',
      });
    }

    const parsed = parseContactRequestBody(request.body ?? {});
    if (!parsed) {
      return reply.status(400).send({
        ok: false,
        error: 'invalid_request',
        message: 'Please fill in all fields with a valid email address.',
      });
    }

    const forwardedFor =
      typeof request.headers['x-forwarded-for'] === 'string'
        ? request.headers['x-forwarded-for']
        : undefined;

    const result = await handleContactForm(
      { pool: options.pool, config: options.config, chatEnv },
      {
        name: parsed.name,
        email: parsed.email,
        message: parsed.message,
        clientIp: resolveClientIp({
          remoteAddress: request.ip,
          forwardedFor,
        }),
      },
    );

    return reply.status(result.statusCode).send(result.body);
  };

  app.post('/contact', contactRoute);
  app.post('/webhook/contact', contactRoute);

  return app;
}

export type ChatServer = ReturnType<typeof createChatServer>;
