import type { ToolDefinition } from '@receptionist/config';

export interface AnthropicTool {
  name: string;
  description: string;
  input_schema: {
    type: 'object';
    properties: Record<string, unknown>;
    required?: string[];
  };
}

const TOOL_SCHEMAS: Record<
  string,
  AnthropicTool['input_schema']
> = {
  take_message: {
    type: 'object',
    properties: {
      name: { type: 'string' },
      phone: { type: 'string' },
      email: { type: 'string' },
      reason: { type: 'string' },
      urgency: { type: 'string', enum: ['low', 'normal', 'high'] },
    },
    required: ['reason'],
  },
  log_interaction: {
    type: 'object',
    properties: {
      summary: { type: 'string' },
      outcome: { type: 'string' },
    },
    required: ['summary'],
  },
  check_availability: {
    type: 'object',
    properties: {
      preferred_dates: {
        type: 'array',
        items: { type: 'string' },
        description:
          'Caller preferences such as weekday names (Tuesday), ISO dates (2026-08-11), today/tomorrow, and morning/afternoon. Always pass what the caller asked for.',
      },
    },
  },
  book_appointment: {
    type: 'object',
    properties: {
      name: { type: 'string' },
      email: { type: 'string' },
      phone: { type: 'string' },
      start_time: {
        type: 'string',
        description: 'ISO-8601 datetime from check_availability slots only',
      },
      service_name: { type: 'string' },
    },
    required: ['name', 'start_time'],
  },
  reschedule_appointment: {
    type: 'object',
    properties: {
      original_start: { type: 'string' },
      new_start: { type: 'string' },
    },
    required: ['original_start', 'new_start'],
  },
  cancel_appointment: {
    type: 'object',
    properties: {
      start_time: { type: 'string' },
      reason: { type: 'string' },
    },
    required: ['start_time'],
  },
  classify_caller: {
    type: 'object',
    properties: {
      classification: {
        type: 'string',
        enum: [
          'EMERGENCY_CLIENT_DOWN',
          'EXISTING_CLIENT_OTHER',
          'PROSPECT',
          'SCREEN_OUT',
          'UNKNOWN',
        ],
      },
      rationale: { type: 'string' },
    },
    required: ['classification'],
  },
  transfer_call: {
    type: 'object',
    properties: {
      reason: { type: 'string' },
    },
    required: ['reason'],
  },
  send_emergency_alert: {
    type: 'object',
    properties: {
      summary: { type: 'string' },
    },
    required: ['summary'],
  },
};

export function buildAnthropicTools(
  activeTools: ToolDefinition[],
): AnthropicTool[] {
  return activeTools.map((tool) => ({
    name: tool.name,
    description: tool.description,
    input_schema: TOOL_SCHEMAS[tool.name] ?? {
      type: 'object',
      properties: {},
    },
  }));
}
