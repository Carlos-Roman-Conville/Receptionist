import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  loadClientConfigFromEnv,
  parseCalendarIntegration,
} from '@receptionist/config';
import { bookAppointment, checkAvailability } from '../src/calendar/booking.js';
import { resetGoogleAccessTokenCache } from '../src/calendar/client.js';
import type { ToolExecutionContext } from '../src/tools/types.js';

vi.mock('@receptionist/db', () => ({
  addBriefingItem: vi.fn().mockResolvedValue(undefined),
}));

describe('calendar booking', () => {
  const config = loadClientConfigFromEnv();
  const calendarId = parseCalendarIntegration(config)?.calendarId ?? 'owner@example.com';
  const pool = {} as ToolExecutionContext['pool'];
  const ctx: ToolExecutionContext = {
    pool,
    config,
    clientSlug: config.paths.clientSlug,
    channel: 'phone',
  };

  beforeEach(() => {
    resetGoogleAccessTokenCache();
    process.env.GOOGLE_CALENDAR_CLIENT_ID = 'client-id';
    process.env.GOOGLE_CALENDAR_CLIENT_SECRET = 'client-secret';
    process.env.GOOGLE_CALENDAR_REFRESH_TOKEN = 'refresh-token';
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    process.env.GOOGLE_CALENDAR_CLIENT_ID = '';
    process.env.GOOGLE_CALENDAR_CLIENT_SECRET = '';
    process.env.GOOGLE_CALENDAR_REFRESH_TOKEN = '';
    resetGoogleAccessTokenCache();
  });

  it('falls back to queued booking when credentials are missing', async () => {
    process.env.GOOGLE_CALENDAR_REFRESH_TOKEN = '';
    const result = await bookAppointment(ctx, {
      name: 'Alex',
      start_time: '2026-08-08T10:00:00-04:00',
    });
    expect(result.message).toContain('queued');
  });

  it('books consultation and buffer events via Google Calendar API', async () => {
    const fetchMock = vi.fn(async (url: string, init?: RequestInit) => {
      if (url === 'https://oauth2.googleapis.com/token') {
        return {
          ok: true,
          json: async () => ({ access_token: 'access-token', expires_in: 3600 }),
        };
      }
      if (url.includes('/events') && init?.method === 'POST') {
        return {
          ok: true,
          json: async () => ({ id: 'event-1', htmlLink: 'https://calendar.example/event-1' }),
        };
      }
      return { ok: false, json: async () => ({ error: { message: 'unexpected' } }) };
    });
    vi.stubGlobal('fetch', fetchMock);

    const result = await bookAppointment(ctx, {
      name: 'Alex',
      email: 'alex@example.com',
      start_time: '2026-08-15T10:00:00-04:00',
    });

    expect(result.ok).toBe(true);
    expect(result.message).toContain('Google Calendar');
    expect(fetchMock.mock.calls.filter(([url]) => String(url).includes('/events')).length).toBe(
      2,
    );
  });

  it('returns open slots from freeBusy', async () => {
    const fetchMock = vi.fn(async (url: string) => {
      if (url === 'https://oauth2.googleapis.com/token') {
        return {
          ok: true,
          json: async () => ({ access_token: 'access-token', expires_in: 3600 }),
        };
      }
      if (url.includes('/freeBusy')) {
        return {
          ok: true,
          json: async () => ({
            calendars: {
              [calendarId]: { busy: [] },
            },
          }),
        };
      }
      return { ok: false, json: async () => ({}) };
    });
    vi.stubGlobal('fetch', fetchMock);

    const result = await checkAvailability(ctx, {});
    expect(result.ok).toBe(true);
    expect(Array.isArray(result.data?.slots)).toBe(true);
  });
});
