import { describe, it, expect } from 'vitest';
import { expandDigitsForSpeech, prepareSpokenText } from '../src/spoken-text.js';

describe('prepareSpokenText', () => {
  it('expands hyphenated US numbers into spoken digit groups', () => {
    expect(prepareSpokenText('Let me confirm: 215-555-0142. Is that right?')).toBe(
      'Let me confirm: two one five, five five five, oh one four two. Is that right?',
    );
  });

  it('expands parenthesized phone numbers', () => {
    expect(prepareSpokenText('Got it: (215) 555-0142.')).toBe(
      'Got it: two one five, five five five, oh one four two.',
    );
  });

  it('leaves ordinary prose alone', () => {
    expect(prepareSpokenText('Monday at nine in the morning.')).toBe(
      'Monday at nine in the morning.',
    );
  });
});

describe('expandDigitsForSpeech', () => {
  it('groups ten-digit numbers as 3-3-4', () => {
    expect(expandDigitsForSpeech('2155550142')).toBe(
      'two one five, five five five, oh one four two',
    );
  });
});
