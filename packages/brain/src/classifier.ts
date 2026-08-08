export const CLASSIFIER_OUTPUTS = [
  'EMERGENCY_CLIENT_DOWN',
  'EXISTING_CLIENT_OTHER',
  'PROSPECT',
  'SCREEN_OUT',
  'UNKNOWN',
] as const;

export type ClassifierOutput = (typeof CLASSIFIER_OUTPUTS)[number];

export interface ClassifierConfig {
  keywords: string[];
  outputs: Record<string, string>;
  defaultUnknown: ClassifierOutput;
}

export function parseClassifierConfig(
  vipList: Record<string, unknown> | null,
): ClassifierConfig {
  if (!vipList) {
    return { keywords: [], outputs: {}, defaultUnknown: 'UNKNOWN' };
  }

  const keywords = Array.isArray(vipList.keyword_tripwire_emergency)
    ? (vipList.keyword_tripwire_emergency as string[])
    : [];

  const outputs =
    vipList.classifier_outputs &&
    typeof vipList.classifier_outputs === 'object'
      ? (vipList.classifier_outputs as Record<string, string>)
      : {};

  return {
    keywords,
    outputs,
    defaultUnknown: 'UNKNOWN',
  };
}

export function keywordTripwire(
  text: string,
  keywords: string[],
): boolean {
  const lower = text.toLowerCase();
  return keywords.some((kw) => lower.includes(kw.toLowerCase()));
}

export function applyKeywordTripwire(
  text: string,
  config: ClassifierConfig,
): ClassifierOutput | null {
  if (keywordTripwire(text, config.keywords)) {
    return 'EMERGENCY_CLIENT_DOWN';
  }
  return null;
}

export function normalizeClassifierOutput(
  value: string | null | undefined,
): ClassifierOutput {
  if (!value) return 'UNKNOWN';
  const upper = value.toUpperCase().trim();
  if ((CLASSIFIER_OUTPUTS as readonly string[]).includes(upper)) {
    return upper as ClassifierOutput;
  }
  return 'UNKNOWN';
}

export function classifyFromToolInput(
  text: string,
  modelOutput: string | null | undefined,
  config: ClassifierConfig,
): ClassifierOutput {
  const tripped = applyKeywordTripwire(text, config);
  if (tripped) return tripped;
  return normalizeClassifierOutput(modelOutput);
}
