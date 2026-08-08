import type { Pool } from 'pg';
import type { ClientConfig } from '@receptionist/config';

export interface ToolExecutionContext {
  pool: Pool;
  config: ClientConfig;
  clientSlug: string;
  sessionId?: string | null;
  callId?: string | null;
  channel: 'phone' | 'web_chat';
  lastUserMessage?: string;
}

export interface ToolExecutionResult {
  ok: boolean;
  message: string;
  classifier?: import('../classifier.js').ClassifierOutput;
  data?: Record<string, unknown>;
}
