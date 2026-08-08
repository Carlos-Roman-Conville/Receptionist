import { describe, it, expect } from 'vitest';
import {
  keywordTripwire,
  applyKeywordTripwire,
  classifyFromToolInput,
  parseClassifierConfig,
  normalizeClassifierOutput,
} from '../src/classifier.js';

describe('classifier', () => {
  const config = parseClassifierConfig({
    keyword_tripwire_emergency: ['down', 'not working', 'broken'],
    classifier_outputs: {
      EMERGENCY_CLIENT_DOWN: 'existing client system broken',
      PROSPECT: 'new inquiry',
    },
  });

  it('tripwire fires on emergency keywords', () => {
    expect(keywordTripwire('Our system is down', config.keywords)).toBe(true);
    expect(applyKeywordTripwire('book a consult', config)).toBeNull();
    expect(applyKeywordTripwire('it is not working', config)).toBe(
      'EMERGENCY_CLIENT_DOWN',
    );
  });

  it('tripwire overrides model classification', () => {
    const result = classifyFromToolInput(
      'the AI is broken',
      'PROSPECT',
      config,
    );
    expect(result).toBe('EMERGENCY_CLIENT_DOWN');
  });

  it('normalizes invalid output to UNKNOWN', () => {
    expect(normalizeClassifierOutput('PROSPECT')).toBe('PROSPECT');
    expect(normalizeClassifierOutput('garbage')).toBe('UNKNOWN');
  });
});
