import type { ClientConfig } from './load.js';

export interface ToolDefinition {
  name: string;
  description: string;
  module: string;
}

const ALL_TOOLS: ToolDefinition[] = [
  {
    name: 'take_message',
    description:
      'Record caller name, contact info, reason, and urgency when a human callback is needed.',
    module: 'phone_handling',
  },
  {
    name: 'log_interaction',
    description: 'Write structured interaction data to the call log database.',
    module: 'phone_handling',
  },
  {
    name: 'check_availability',
    description: 'Query Google Calendar for open consultation slots.',
    module: 'calendar_management',
  },
  {
    name: 'book_appointment',
    description:
      'Book a consultation: attendee-facing duration plus private buffer from services.yaml.',
    module: 'calendar_management',
  },
  {
    name: 'reschedule_appointment',
    description: 'Move an existing booking to a new time.',
    module: 'calendar_management',
  },
  {
    name: 'cancel_appointment',
    description: 'Cancel an existing booking.',
    module: 'calendar_management',
  },
  {
    name: 'classify_caller',
    description:
      'Assign one classifier output: EMERGENCY_CLIENT_DOWN, EXISTING_CLIENT_OTHER, PROSPECT, SCREEN_OUT, or UNKNOWN.',
    module: 'call_screening',
  },
  {
    name: 'transfer_call',
    description:
      'Bridge the caller to the emergency transfer number when EMERGENCY_CLIENT_DOWN is detected.',
    module: 'emergency_routing',
  },
  {
    name: 'send_emergency_alert',
    description:
      'Send a Pushover alert simultaneously with an emergency transfer attempt.',
    module: 'emergency_routing',
  },
];

/** Modules that enable shared text-channel tools (phone + web_chat) */
const CHANNEL_MODULES = ['phone_handling', 'web_chat'] as const;

export function getActiveTools(config: ClientConfig): ToolDefinition[] {
  const { modules } = config.moduleConfig;
  const hasChannel = CHANNEL_MODULES.some((m) => modules[m] === true);

  return ALL_TOOLS.filter((tool) => {
    if (tool.module === 'phone_handling') {
      return hasChannel;
    }
    return modules[tool.module] === true;
  });
}

export function formatToolsSection(tools: ToolDefinition[]): string {
  if (tools.length === 0) {
    return 'No tools are available for this deployment.';
  }
  return tools
    .map((t) => `- ${t.name}: ${t.description}`)
    .join('\n');
}

/** Tool names that belong to modules explicitly set to false */
export const INACTIVE_MODULE_TOOLS: Record<string, string[]> = {
  calendar_management: [
    'check_availability',
    'book_appointment',
    'reschedule_appointment',
    'cancel_appointment',
  ],
  call_screening: ['classify_caller'],
  emergency_routing: ['transfer_call', 'send_emergency_alert'],
  email_handling: [],
  sms_handling: [],
  data_entry: ['log_interaction'],
};
