import { describe, it, expect } from 'vitest';
import {
  areaCodeFromPhone,
  buildTimeContext,
  formatSlotLabel,
  timezoneFromPhone,
} from '../src/time-context.js';

describe('timezoneFromPhone', () => {
  it('maps US area codes to timezones across formats', () => {
    expect(timezoneFromPhone('+12674873609')).toBe('America/New_York');
    expect(timezoneFromPhone('(267) 487-3609')).toBe('America/New_York');
    expect(timezoneFromPhone('2674873609')).toBe('America/New_York');
    expect(timezoneFromPhone('+14155550123')).toBe('America/Los_Angeles');
    expect(timezoneFromPhone('+16025550123')).toBe('America/Phoenix');
    expect(timezoneFromPhone('+13125550123')).toBe('America/Chicago');
    expect(timezoneFromPhone('+13035550123')).toBe('America/Denver');
  });

  it('returns null for unusable input', () => {
    expect(timezoneFromPhone(null)).toBeNull();
    expect(timezoneFromPhone('')).toBeNull();
    expect(timezoneFromPhone('12345')).toBeNull();
    expect(areaCodeFromPhone('+442071234567')).toBe(null);
  });
});

describe('buildTimeContext', () => {
  const now = new Date('2026-08-09T02:30:00.000Z'); // Aug 8, 10:30 PM in New York

  it('states today and tomorrow in the business timezone', () => {
    const context = buildTimeContext({
      businessTimezone: 'America/New_York',
      callerPhone: '+12674873609',
      now,
    });

    expect(context).toContain('Saturday, August 8, 2026');
    expect(context).toContain('Today is 2026-08-08');
    expect(context).toContain('Tomorrow is Sunday, August 9, 2026-08-09');
    expect(context).toContain('same timezone as the business');
    expect(context).toContain("Never ask the caller what today's date is");
  });

  it('flags a caller in a different timezone', () => {
    const context = buildTimeContext({
      businessTimezone: 'America/New_York',
      callerPhone: '+14155550123',
      now,
    });
    expect(context).toContain('America/Los_Angeles');
    expect(context).toContain('differs from the business timezone');
  });

  it('falls back to business timezone when area code is unknown', () => {
    const context = buildTimeContext({
      businessTimezone: 'America/New_York',
      callerPhone: null,
      now,
    });
    expect(context).toContain('Caller timezone is unknown');
    expect(context).not.toContain('undefined');
  });
});

describe('formatSlotLabel', () => {
  it('renders a spoken-friendly local time', () => {
    const label = formatSlotLabel(
      new Date('2026-08-10T14:00:00.000Z'),
      'America/New_York',
    );
    expect(label).toBe('Monday, August 10 at 10:00 AM');
  });
});
