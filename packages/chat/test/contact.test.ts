import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { Pool } from 'pg';
import { loadClientConfigFromEnv } from '@receptionist/config';
import { checkRateLimit, addBriefingItem, logInteraction } from '@receptionist/db';
import { parseContactRequestBody, handleContactForm } from '../src/contact.js';

vi.mock('@receptionist/db', () => ({
  checkRateLimit: vi.fn(),
  addBriefingItem: vi.fn(),
  logInteraction: vi.fn(),
}));

vi.mock('@receptionist/async', () => ({
  sendEmail: vi.fn().mockResolvedValue({ sent: true }),
  defaultEmailFrom: vi.fn().mockReturnValue('agent@example.com'),
}));

describe('contact form', () => {
  const pool = {} as Pool;
  const config = loadClientConfigFromEnv();
  const chatEnv = {
    port: 3000,
    host: '127.0.0.1',
    allowedOrigins: ['https://crc-solutions.org'],
    allowNoOrigin: true,
    rateLimitMax: 20,
    rateLimitWindowMs: 3_600_000,
  };

  beforeEach(() => {
    vi.mocked(checkRateLimit).mockResolvedValue({ allowed: true, count: 1 });
    vi.mocked(addBriefingItem).mockResolvedValue(undefined);
    vi.mocked(logInteraction).mockResolvedValue(undefined);
  });

  it('parses valid contact payloads', () => {
    expect(
      parseContactRequestBody({
        name: 'Alex',
        email: 'Alex@Example.com',
        message: 'Need help',
      }),
    ).toEqual({
      name: 'Alex',
      email: 'alex@example.com',
      message: 'Need help',
      honeypot: '',
    });
  });

  it('rejects honeypot submissions', () => {
    expect(
      parseContactRequestBody({
        name: 'Bot',
        email: 'bot@example.com',
        message: 'spam',
        website: 'filled',
      }),
    ).toBeNull();
  });

  it('stores briefing item for valid submission', async () => {
    const result = await handleContactForm(
      { pool, config, chatEnv },
      {
        name: 'Alex',
        email: 'alex@example.com',
        message: 'Interested in a consultation',
        clientIp: '127.0.0.1',
      },
    );

    expect(result.statusCode).toBe(200);
    expect(result.body.ok).toBe(true);
    expect(addBriefingItem).toHaveBeenCalledWith(
      pool,
      expect.objectContaining({ itemType: 'contact_form' }),
    );
  });
});
