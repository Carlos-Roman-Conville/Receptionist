import type { AnthropicTool } from './tools/registry.js';

export interface ClaudeMessage {
  role: 'user' | 'assistant';
  content: string;
}

export interface ClaudeToolUseBlock {
  type: 'tool_use';
  id: string;
  name: string;
  input: Record<string, unknown>;
}

export interface ClaudeTextBlock {
  type: 'text';
  text: string;
}

export type ClaudeContentBlock = ClaudeTextBlock | ClaudeToolUseBlock;

export interface ClaudeResponse {
  id: string;
  content: ClaudeContentBlock[];
  stop_reason: string | null;
}

export interface ClaudeRequest {
  model: string;
  max_tokens: number;
  system: string;
  messages: ClaudeMessage[];
  tools?: AnthropicTool[];
}

export interface ClaudeClientOptions {
  apiKey?: string;
  baseUrl?: string;
  fetchImpl?: typeof fetch;
}

export class ClaudeClient {
  private readonly apiKey: string;
  private readonly baseUrl: string;
  private readonly fetchImpl: typeof fetch;

  constructor(options: ClaudeClientOptions = {}) {
    this.apiKey = options.apiKey ?? process.env.ANTHROPIC_API_KEY ?? '';
    if (!this.apiKey) {
      throw new Error('ANTHROPIC_API_KEY is required');
    }
    this.baseUrl = options.baseUrl ?? 'https://api.anthropic.com';
    this.fetchImpl = options.fetchImpl ?? fetch;
  }

  async createMessage(request: ClaudeRequest): Promise<ClaudeResponse> {
    const res = await this.fetchImpl(`${this.baseUrl}/v1/messages`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-api-key': this.apiKey,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify(request),
    });

    if (!res.ok) {
      const body = await res.text();
      throw new Error(`Claude API error ${res.status}: ${body.slice(0, 400)}`);
    }

    return (await res.json()) as ClaudeResponse;
  }
}

export function extractText(response: ClaudeResponse): string {
  return response.content
    .filter((b): b is ClaudeTextBlock => b.type === 'text')
    .map((b) => b.text)
    .join('')
    .trim();
}

export function extractToolUses(response: ClaudeResponse): ClaudeToolUseBlock[] {
  return response.content.filter(
    (b): b is ClaudeToolUseBlock => b.type === 'tool_use',
  );
}
