import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { Pool } from 'pg';
import { loadClientConfigFromEnv } from '@receptionist/config';
import * as db from '@receptionist/db';
import { createAsyncServer } from '../src/server.js';

vi.mock('@receptionist/db', async (importOriginal) => {
  const actual = await importOriginal<typeof db>();
  return {
    ...actual,
    getLastBriefingDeliveredAt: vi.fn(),
    listPendingBriefingItems: vi.fn(),
    listLeadsSince: vi.fn(),
    listCallsSince: vi.fn(),
    createDailyBriefingRecord: vi.fn(),
    markBriefingItemsIncluded: vi.fn(),
    listUnnotifiedLeads: vi.fn(),
  };
});

vi.mock('../src/smtp.js', () => ({
  sendEmail: vi.fn().mockResolvedValue({ sent: true, messageId: '1' }),
  defaultEmailFrom: vi.fn().mockReturnValue('agent@example.com'),
}));

describe('async server', () => {
  const pool = {} as Pool;
  const config = loadClientConfigFromEnv();
  const asyncEnv = {
    port: 3002,
    host: '127.0.0.1',
    webhookSecret: '',
    pushoverAppToken: '',
    pushoverUserKey: '',
    smtpHost: 'smtp.example.com',
    smtpPort: 587,
    smtpUser: 'agent@example.com',
    smtpPass: 'secret',
    defaultNotifyEmail: 'owner@example.com',
  };

  beforeEach(() => {
    vi.mocked(db.getLastBriefingDeliveredAt).mockResolvedValue(null);
    vi.mocked(db.listPendingBriefingItems).mockResolvedValue([]);
    vi.mocked(db.listLeadsSince).mockResolvedValue([]);
    vi.mocked(db.listCallsSince).mockResolvedValue([]);
    vi.mocked(db.createDailyBriefingRecord).mockResolvedValue('briefing-id');
    vi.mocked(db.markBriefingItemsIncluded).mockResolvedValue(undefined);
  });

  it('runs daily briefing via HTTP trigger', async () => {
    const app = createAsyncServer({ pool, config, asyncEnv });
    const res = await app.inject({
      method: 'POST',
      url: '/run/briefing',
    });

    expect(res.statusCode).toBe(200);
    expect(res.json().ok).toBe(true);
    await app.close();
  });
});
