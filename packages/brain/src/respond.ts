import type { Pool } from 'pg';
import type { ClientConfig } from '@receptionist/config';
import {
  assemblePrompt,
  getActiveTools,
} from '@receptionist/config';
import {
  appendMessage,
  upsertSession,
  type SessionChannel,
} from '@receptionist/db';
import {
  buildChannelOverlay,
  chatJsonFallback,
  parseChatJson,
  type ParsedChatResponse,
} from './channel-overlay.js';
import {
  applyKeywordTripwire,
  parseClassifierConfig,
  type ClassifierOutput,
} from './classifier.js';
import {
  ClaudeClient,
  extractText,
  extractToolUses,
  type ClaudeMessage,
  type ClaudeResponse,
} from './claude.js';
import { buildTimeContext } from './time-context.js';
import { buildAnthropicTools } from './tools/registry.js';
import { executeTool, recordLeadFromChat } from './tools/executor.js';
import type { ToolExecutionContext } from './tools/types.js';

const MAX_TOOL_ROUNDS = 5;

export interface BrainRequest {
  channel: SessionChannel;
  sessionId: string;
  userMessage: string;
  history?: ClaudeMessage[];
  visitorEmail?: string | null;
  callerPhone?: string | null;
}

export interface BrainResponse {
  reply: string;
  channel: SessionChannel;
  sessionDbId: string;
  classifier: ClassifierOutput | null;
  toolResults: Array<{ name: string; ok: boolean; message: string }>;
  chat?: ParsedChatResponse;
}

export interface BrainOptions {
  config: ClientConfig;
  pool: Pool;
  claude?: ClaudeClient;
  model?: string;
}

export class Brain {
  private readonly config: ClientConfig;
  private readonly pool: Pool;
  private readonly claude: ClaudeClient;
  private readonly model: string;

  constructor(options: BrainOptions) {
    this.config = options.config;
    this.pool = options.pool;
    this.claude = options.claude ?? new ClaudeClient();
    this.model = options.model ?? 'claude-haiku-4-5-20251001';
  }

  async respond(request: BrainRequest): Promise<BrainResponse> {
    const session = await upsertSession(this.pool, {
      clientSlug: this.config.paths.clientSlug,
      channel: request.channel,
      externalSessionId: request.sessionId,
      visitorEmail: request.visitorEmail,
      callerPhone: request.callerPhone,
    });

    await appendMessage(this.pool, session.id, 'user', request.userMessage);

    const classifierConfig = parseClassifierConfig(this.config.vipList);
    const tripwire = applyKeywordTripwire(
      request.userMessage,
      classifierConfig,
    );

    const { systemPrompt } = assemblePrompt(this.config);
    const system = [
      systemPrompt,
      '',
      buildTimeContext({
        businessTimezone: String(
          this.config.businessDetails.hours?.timezone ?? '',
        ),
        callerPhone: request.callerPhone,
      }),
      '',
      buildChannelOverlay(request.channel, this.config),
    ].join('\n');

    const activeTools = getActiveTools(this.config);
    const tools = buildAnthropicTools(activeTools);
    const history = request.history ?? [];
    const messages: ClaudeMessage[] = [
      ...history,
      { role: 'user', content: request.userMessage },
    ];

    let classifier: ClassifierOutput | null = tripwire;
    const toolResults: BrainResponse['toolResults'] = [];

    const response = await this.runWithTools({
      system,
      messages,
      tools,
      toolCtx: {
        pool: this.pool,
        config: this.config,
        clientSlug: this.config.paths.clientSlug,
        sessionId: session.id,
        channel: request.channel,
        lastUserMessage: request.userMessage,
      },
      onToolExecuted: (entry) => {
        toolResults.push(entry);
        if (entry.classifier) {
          classifier = entry.classifier;
        }
      },
    });

    let reply = extractText(response);
    let chat: ParsedChatResponse | undefined;

    if (request.channel === 'web_chat') {
      let parsedChat = false;
      try {
        chat = parseChatJson(reply);
        reply = chat.reply;
        parsedChat = true;
      } catch {
        chat = chatJsonFallback();
        reply = chat.reply;
      }

      if (
        parsedChat &&
        chat &&
        (chat.leadScore === 'hot' ||
          chat.leadScore === 'warm' ||
          chat.action === 'booked')
      ) {
        await recordLeadFromChat(
          {
            pool: this.pool,
            config: this.config,
            clientSlug: this.config.paths.clientSlug,
            sessionId: session.id,
            channel: request.channel,
          },
          {
            email: request.visitorEmail,
            leadScore: chat.leadScore ?? null,
            intent: chat.intent ?? null,
            notes: chat.leadData?.notes ? String(chat.leadData.notes) : null,
          },
        );
      }
    }

    if (!reply) {
      reply =
        request.channel === 'web_chat'
          ? chatJsonFallback().reply
          : "I'm sorry, I didn't catch that. Could you say that again?";
    }

    await appendMessage(this.pool, session.id, 'assistant', reply);

    return {
      reply,
      channel: request.channel,
      sessionDbId: session.id,
      classifier,
      toolResults,
      chat,
    };
  }

  private async runWithTools(options: {
    system: string;
    messages: ClaudeMessage[];
    tools: ReturnType<typeof buildAnthropicTools>;
    toolCtx: ToolExecutionContext;
    onToolExecuted: (entry: {
      name: string;
      ok: boolean;
      message: string;
      classifier?: ClassifierOutput;
    }) => void;
  }): Promise<ClaudeResponse> {
    const conversation = [...options.messages];
    let response = await this.claude.createMessage({
      model: this.model,
      max_tokens: 1024,
      system: options.system,
      messages: conversation,
      tools: options.tools.length > 0 ? options.tools : undefined,
    });

    for (let round = 0; round < MAX_TOOL_ROUNDS; round++) {
      const toolUses = extractToolUses(response);
      if (toolUses.length === 0 || response.stop_reason !== 'tool_use') {
        break;
      }

      const toolResults = [];
      for (const toolUse of toolUses) {
        const started = Date.now();
        const result = await executeTool(
          toolUse.name,
          toolUse.input,
          options.toolCtx,
        );
        console.info(
          `[brain] tool ${toolUse.name} ok=${result.ok} ms=${Date.now() - started}`,
        );
        options.onToolExecuted({
          name: toolUse.name,
          ok: result.ok,
          message: result.message,
          classifier: result.classifier,
        });
        toolResults.push({
          type: 'tool_result' as const,
          tool_use_id: toolUse.id,
          content: JSON.stringify({
            ok: result.ok,
            message: result.message,
            data: result.data ?? null,
          }),
        });
      }

      conversation.push({ role: 'assistant', content: response.content });
      conversation.push({ role: 'user', content: toolResults });

      response = await this.claude.createMessage({
        model: this.model,
        max_tokens: 1024,
        system: options.system,
        messages: conversation,
        tools: options.tools.length > 0 ? options.tools : undefined,
      });
    }

    return response;
  }
}
