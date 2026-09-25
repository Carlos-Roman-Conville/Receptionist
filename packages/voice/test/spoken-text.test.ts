import { describe, it, expect } from 'vitest';
import { expandDigitsForSpeech, prepareSpokenText } from '../src/spoken-text.js';

describe('prepareSpokenText', () => {
  it('expands hyphenated US numbers into spoken digit groups', () => {
    expect(prepareSpokenText('Let me confirm: 856-397-9706. Is that right?')).toBe(
      'Let me confirm: eight five six, three nine seven, nine seven oh six. Is that right?',
    );
  });

  it('expands parenthesized phone numbers', () => {
    expect(prepareSpokenText('Got it: (856) 397-9706.')).toBe(
      'Got it: eight five six, three nine seven, nine seven oh six.',
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
    expect(expandDigitsForSpeech('8563979706')).toBe(
      'eight five six, three nine seven, nine seven oh six',
    );
  });
});
