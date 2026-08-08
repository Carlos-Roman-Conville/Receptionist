import { describe, it, expect, vi } from 'vitest';
import { loadClientConfigFromEnv } from '@receptionist/config';
import type { BriefingItemRow, CallSummaryRow, LeadRow } from '@receptionist/db';
import { compileDailyBriefing } from '../src/briefing/compile.js';
import { parseBriefingSettings } from '../src/briefing/settings.js';
import { sendPushoverMessage } from '../src/pushover.js';

describe('briefing compile', () => {
  const config = loadClientConfigFromEnv();

  it('reads briefing settings from module config', () => {
    const settings = parseBriefingSettings(config);
    expect(settings?.enabled).toBe(true);
    expect(settings?.deliveryTime).toBe('06:30');
    expect(settings?.recipients.length).toBeGreaterThan(0);
  });

  it('compiles sections without hardcoded client strings in source', () => {
    const items: BriefingItemRow[] = [
      {
        id: '1',
        client_slug: config.paths.clientSlug,
        item_type: 'booking',
        summary: 'Booking requested for tomorrow 10am',
        occurred_at: new Date('2026-08-07T14:00:00Z'),
        metadata: {},
      },
    ];
    const leads: LeadRow[] = [
      {
        id: '2',
        client_slug: config.paths.clientSlug,
        session_id: null,
        email: 'prospect@example.com',
        phone: null,
        lead_score: 'hot',
        intent: 'question',
        notes: null,
        status: 'new',
        created_at: new Date('2026-08-07T15:00:00Z'),
      },
    ];
    const calls: CallSummaryRow[] = [];

    const compiled = compileDailyBriefing({
      config,
      since: new Date('2026-08-06T10:30:00Z'),
      until: new Date('2026-08-07T10:30:00Z'),
      items,
      leads,
      calls,
    });

    expect(compiled.subject).toContain('Daily briefing');
    expect(compiled.bodyText).toContain('Queued items');
    expect(compiled.bodyText).toContain('Booking requested');
    expect(compiled.bodyText).toContain('prospect@example.com');
    expect(compiled.itemCount).toBe(2);
  });
});

describe('pushover', () => {
  it('skips when credentials missing', async () => {
    const result = await sendPushoverMessage(
      {
        title: 'Test',
        message: 'Hello',
        appToken: '',
        userKey: '',
      },
      vi.fn(),
    );
    expect(result.sent).toBe(false);
  });

  it('posts to Pushover when configured', async () => {
    const fetchImpl = vi.fn().mockResolvedValue({ ok: true });
    const result = await sendPushoverMessage(
      {
        title: 'Emergency',
        message: 'System down',
        appToken: 'app',
        userKey: 'user',
        priority: 1,
      },
      fetchImpl,
    );
    expect(result.sent).toBe(true);
    expect(fetchImpl).toHaveBeenCalledWith(
      'https://api.pushover.net/1/messages.json',
      expect.objectContaining({ method: 'POST' }),
    );
  });
});
