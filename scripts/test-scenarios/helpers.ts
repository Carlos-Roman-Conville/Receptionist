import { expect, vi } from 'vitest';
import type { Pool } from 'pg';
import type { ClientConfig } from '@receptionist/config';
import type { Brain, ClaudeResponse } from '@receptionist/brain';

export const poolStub = {} as Pool;

export function jsonChatReply(reply: string, extra: Record<string, unknown> = {}): string {
  return JSON.stringify({
    reply,
    leadScore: null,
    action: 'none',
    ...extra,
  });
}

export function claudeTextResponse(text: string): ClaudeResponse {
  return {
    id: 'msg_test',
    content: [{ type: 'text', text }],
    stop_reason: 'end_turn',
  };
}

export function createStubBrain(respondImpl: Brain['respond']): Brain {
  return { respond: respondImpl } as Brain;
}

export function cannedServicesReply(): string {
  return (
    'We help owner-led businesses fill empty operational roles with AI reception and workflow automation. ' +
    'A free consultation is about 20 minutes if you want to explore fit.'
  );
}

export function assertNoPricing(text: string): void {
  expect(text).not.toMatch(/\$\d/);
  expect(text.toLowerCase()).not.toMatch(/price is|costs \$|starting at \$/);
}

export function assertMentionsConsult(text: string): void {
  expect(text.toLowerCase()).toMatch(/20.?min|twenty.minute|20 minute/);
}

export async function stubBrainFromClaude(
  config: ClientConfig,
  pool: Pool,
  claudeFactory: (channel: 'phone' | 'web_chat', userMessage: string) => ClaudeResponse,
): Promise<Brain> {
  const { Brain: BrainClass, ClaudeClient } = await import('@receptionist/brain');
  const client = {
    createMessage: vi.fn(async (req: { system: string; messages: Array<{ content: string }> }) => {
      const last = req.messages.at(-1)?.content ?? '';
      const channel = req.system.includes('WEB CHAT') ? 'web_chat' : 'phone';
      return claudeFactory(channel, last);
    }),
  } as unknown as ClaudeClient;

  return new BrainClass({ config, pool, claude: client });
}
