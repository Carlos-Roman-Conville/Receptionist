export { Brain } from './respond.js';
export type { BrainRequest, BrainResponse, BrainOptions } from './respond.js';
export {
  CLASSIFIER_OUTPUTS,
  parseClassifierConfig,
  keywordTripwire,
  applyKeywordTripwire,
  classifyFromToolInput,
  normalizeClassifierOutput,
} from './classifier.js';
export type { ClassifierOutput, ClassifierConfig } from './classifier.js';
export { ClaudeClient, extractText, extractToolUses } from './claude.js';
export type { ClaudeMessage, ClaudeResponse } from './claude.js';
export { buildAnthropicTools } from './tools/registry.js';
export type { AnthropicTool } from './tools/registry.js';
export { executeTool, recordLeadFromChat } from './tools/executor.js';
export {
  buildChannelOverlay,
  parseChatJson,
  chatJsonFallback,
} from './channel-overlay.js';
export type { BrainChannel, ParsedChatResponse } from './channel-overlay.js';
