import Fastify, { type FastifyReply, type FastifyRequest } from 'fastify';
import websocket from '@fastify/websocket';
import type { WebSocket } from 'ws';
import type { Pool } from 'pg';
import type { ClientConfig } from '@receptionist/config';
import { Brain } from '@receptionist/brain';
import {
  createCall,
  endCall,
  getCallByTelnyxControlId,
  logInteraction,
  upsertSession,
} from '@receptionist/db';
import { ElevenLabsClient } from './elevenlabs/client.js';
import type { VoiceEnvConfig } from './env.js';
import { mediaStreamUrl } from './env.js';
import { CallSessionManager } from './session/manager.js';
import {
  TelnyxCallControl,
  verifyTelnyxWebhook,
} from './telnyx/client.js';
import {
  callControlIdFromPayload,
  decodeMediaPayload,
  isInboundMediaTrack,
  parseTelnyxMediaMessage,
  parseTelnyxWebhook,
} from './telnyx/types.js';

export interface CreateVoiceServerOptions {
  pool: Pool;
  config: ClientConfig;
  voiceEnv: VoiceEnvConfig;
  brain?: Brain;
  telnyx?: TelnyxCallControl;
  sessions?: CallSessionManager;
}

declare module 'fastify' {
  interface FastifyRequest {
    rawBody?: string;
  }
}

export function createVoiceServer(options: CreateVoiceServerOptions) {
  const brain =
    options.brain ?? new Brain({ config: options.config, pool: options.pool });
  const telnyx =
    options.telnyx ?? new TelnyxCallControl(options.voiceEnv.telnyxApiKey);
  const sessions = options.sessions ?? new CallSessionManager();
  const elevenLabs = new ElevenLabsClient({
    apiKey: options.voiceEnv.elevenLabsApiKey,
    voiceId: options.voiceEnv.elevenLabsVoiceId,
  });
  const voiceEnv = options.voiceEnv;

  const app = Fastify({ logger: true, trustProxy: true });

  app.addContentTypeParser(
    'application/json',
    { parseAs: 'string' },
    (request, body, done) => {
      request.rawBody = body as string;
      try {
        done(null, JSON.parse(body as string));
      } catch (err) {
        done(err as Error, undefined);
      }
    },
  );

  app.get('/health', async () => ({
    ok: true,
    service: 'voice',
    client: options.config.paths.clientSlug,
    phoneEnabled: options.config.moduleConfig.modules.phone_handling === true,
    activeCalls: sessions.size(),
  }));

  app.post(
    '/webhooks/telnyx',
    async (request: FastifyRequest, reply: FastifyReply) => {
      const rawBody = request.rawBody ?? JSON.stringify(request.body ?? {});
      const valid = verifyTelnyxWebhook(
        rawBody,
        request.headers['telnyx-signature-ed25519'] as string | undefined,
        request.headers['telnyx-timestamp'] as string | undefined,
        {
          publicKey: voiceEnv.telnyxPublicKey,
          skipVerification: voiceEnv.skipTelnyxSignature,
        },
      );

      if (!valid) {
        return reply.status(401).send({ error: 'invalid_signature' });
      }

      const parsed = parseTelnyxWebhook(request.body);
      if (!parsed) {
        return reply.status(400).send({ error: 'invalid_payload' });
      }

      const callControlId = callControlIdFromPayload(parsed.payload);
      if (!callControlId) {
        return reply.status(400).send({ error: 'missing_call_control_id' });
      }

      await logInteraction(options.pool, {
        clientSlug: options.config.paths.clientSlug,
        eventType: `telnyx:${parsed.eventType}`,
        payload: { call_control_id: callControlId },
      });

      try {
        if (parsed.eventType === 'call.initiated') {
          const callerNumber = parsed.payload.from ?? null;
          const externalSessionId = `call_${callControlId}`;

          await upsertSession(options.pool, {
            clientSlug: options.config.paths.clientSlug,
            channel: 'phone',
            externalSessionId,
            callerPhone: callerNumber,
          });

          await createCall(options.pool, {
            clientSlug: options.config.paths.clientSlug,
            telnyxCallControlId: callControlId,
            callerNumber,
            metadata: {
              direction: parsed.payload.direction ?? 'inbound',
              to: parsed.payload.to ?? null,
            },
          });

          await telnyx.answer(callControlId);
        }

        if (parsed.eventType === 'call.answered') {
          const streamUrl = mediaStreamUrl(voiceEnv.publicWsBaseUrl, callControlId);
          request.log.info({ callControlId, streamUrl }, 'Starting Telnyx media stream');
          await telnyx.startStreaming(callControlId, streamUrl);
        }

        if (
          parsed.eventType === 'streaming.started' ||
          parsed.eventType === 'streaming.stopped' ||
          parsed.eventType === 'streaming.failed'
        ) {
          request.log.info(
            { callControlId, eventType: parsed.eventType, payload: parsed.payload },
            'Telnyx streaming lifecycle event',
          );
        }

        if (parsed.eventType === 'call.hangup') {
          const call = await getCallByTelnyxControlId(options.pool, callControlId);
          if (call) {
            await endCall(options.pool, call.id, { outcome: 'hangup' });
          }
          await sessions.close(callControlId);
        }
      } catch (err) {
        request.log.error({ err, callControlId }, 'Telnyx webhook handler failed');
        return reply.status(500).send({
          error: err instanceof Error ? err.message : 'handler_failed',
        });
      }

      return reply.status(200).send({ ok: true });
    },
  );

  app.register(async (fastify) => {
    await fastify.register(websocket);

    fastify.get('/media', { websocket: true }, (socket: WebSocket, request) => {
      const query = request.query as { call_control_id?: string };
      const callControlId = query.call_control_id;
      if (!callControlId) {
        socket.close(1008, 'missing call_control_id');
        return;
      }

      void attachMediaSocket(socket, callControlId);
    });
  });

  async function attachMediaSocket(socket: WebSocket, callControlId: string) {
    const pendingMessages: string[] = [];
    let session: ReturnType<CallSessionManager['create']> | null = null;

    const handleMediaMessage = (raw: string) => {
      if (!session) return;

      const message = parseTelnyxMediaMessage(raw);
      if (!message?.event) return;

      if (message.event === 'start') {
        app.log.info({ callControlId }, 'Telnyx media stream started');
        void session.start();
        return;
      }

      if (message.event === 'media' && message.media?.payload) {
        if (!isInboundMediaTrack(message.media.track)) return;
        session.ingestInboundAudio(decodeMediaPayload(message.media.payload));
        return;
      }

      if (message.event === 'stop') {
        app.log.info({ callControlId }, 'Telnyx media stream stopped');
        void session.close();
      }
    };

    socket.on('message', (raw) => {
      const text = String(raw);
      if (!session) {
        pendingMessages.push(text);
        return;
      }
      handleMediaMessage(text);
    });

    socket.on('close', () => {
      void session?.close();
    });

    const call = await getCallByTelnyxControlId(options.pool, callControlId);
    if (!call) {
      socket.close(1008, 'unknown call');
      return;
    }

    const externalSessionId = `call_${callControlId}`;
    let outboundFrames = 0;
    const sendMedia = (payloadBase64: string) => {
      if (socket.readyState !== socket.OPEN) return;
      socket.send(
        JSON.stringify({
          event: 'media',
          media: { payload: payloadBase64 },
        }),
      );
      outboundFrames += 1;
      if (outboundFrames === 1) {
        app.log.info({ callControlId }, 'Sent first outbound audio frame to Telnyx');
      }
    };

    session = sessions.create({
      callControlId,
      callDbId: call.id,
      callerNumber: call.caller_number,
      externalSessionId,
      config: options.config,
      pool: options.pool,
      brain,
      telnyx,
      elevenLabs,
      deepgramApiKey: voiceEnv.deepgramApiKey,
      sendMedia,
    });

    session.attachMedia();

    for (const message of pendingMessages) {
      handleMediaMessage(message);
    }
  }

  return app;
}

export type VoiceServer = ReturnType<typeof createVoiceServer>;
