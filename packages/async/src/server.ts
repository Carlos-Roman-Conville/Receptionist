import Fastify, { type FastifyReply, type FastifyRequest } from 'fastify';
import type { Pool } from 'pg';
import type { ClientConfig } from '@receptionist/config';
import type { AsyncEnvConfig } from './env.js';
import { runDailyBriefing } from './briefing/run.js';
import { notifyPendingLeads } from './leads/notify.js';

export interface CreateAsyncServerOptions {
  pool: Pool;
  config: ClientConfig;
  asyncEnv: AsyncEnvConfig;
}

function authorize(
  request: FastifyRequest,
  secret: string,
): boolean {
  if (!secret) return true;
  const header = request.headers['x-async-secret'];
  return header === secret;
}

export function createAsyncServer(options: CreateAsyncServerOptions) {
  const app = Fastify({ logger: true });

  app.get('/health', async () => ({
    ok: true,
    service: 'async',
    client: options.config.paths.clientSlug,
    dailyBriefingEnabled:
      options.config.moduleConfig.modules.daily_briefing === true,
  }));

  app.post('/run/briefing', async (request, reply: FastifyReply) => {
    if (!authorize(request, options.asyncEnv.webhookSecret)) {
      return reply.status(401).send({ error: 'unauthorized' });
    }

    const result = await runDailyBriefing(options.pool, options.config);
    return reply.status(result.ok ? 200 : 400).send(result);
  });

  app.post('/run/leads', async (request, reply: FastifyReply) => {
    if (!authorize(request, options.asyncEnv.webhookSecret)) {
      return reply.status(401).send({ error: 'unauthorized' });
    }

    const result = await notifyPendingLeads(options.pool, options.config);
    return reply.status(200).send(result);
  });

  return app;
}

export type AsyncServer = ReturnType<typeof createAsyncServer>;
