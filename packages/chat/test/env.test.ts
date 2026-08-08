import { describe, it, expect } from 'vitest';
import {
  isOriginAllowed,
  isValidEmail,
  resolveUserMessage,
  rateLimitBucketKeys,
} from '../src/env.js';
import { parseChatRequestBody } from '../src/http.js';

describe('chat env helpers', () => {
  it('validates allowed origins', () => {
    expect(
      isOriginAllowed('https://crc-solutions.org', {
        allowedOrigins: ['https://crc-solutions.org'],
        allowNoOrigin: false,
      }),
    ).toBe(true);
    expect(
      isOriginAllowed('https://evil.example', {
        allowedOrigins: ['https://crc-solutions.org'],
        allowNoOrigin: false,
      }),
    ).toBe(false);
    expect(
      isOriginAllowed(undefined, {
        allowedOrigins: ['https://crc-solutions.org'],
        allowNoOrigin: true,
      }),
    ).toBe(true);
  });

  it('validates email addresses', () => {
    expect(isValidEmail('user@example.com')).toBe(true);
    expect(isValidEmail('bad')).toBe(false);
  });

  it('resolves session start on first empty message', () => {
    expect(resolveUserMessage('', 0)).toBe('(Visitor opened chat.)');
    expect(resolveUserMessage('', 2)).toBeNull();
    expect(resolveUserMessage('hello', 0)).toBe('hello');
  });

  it('builds distinct session and ip rate limit keys', () => {
    const keys = rateLimitBucketKeys('crc-solutions', 'sess_1', '1.2.3.4');
    expect(keys.sessionKey).toContain('sess_1');
    expect(keys.ipKey).toContain('1.2.3.4');
    expect(keys.sessionKey).not.toBe(keys.ipKey);
  });
});

describe('parseChatRequestBody', () => {
  it('parses required fields and normalizes email', () => {
    expect(
      parseChatRequestBody({
        message: 'Hi',
        sessionId: 'sess_abc',
        email: 'User@Example.com',
      }),
    ).toEqual({
      message: 'Hi',
      sessionId: 'sess_abc',
      email: 'user@example.com',
    });
  });

  it('returns null when email or session id missing', () => {
    expect(parseChatRequestBody({ message: 'Hi', sessionId: 'sess_abc' })).toBeNull();
    expect(parseChatRequestBody({ message: 'Hi', email: 'a@b.com' })).toBeNull();
  });
});
