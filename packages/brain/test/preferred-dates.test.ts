import { describe, it, expect } from 'vitest';
import { parsePreferredDates } from '../src/calendar/booking.js';

describe('parsePreferredDates', () => {
  const now = new Date('2026-08-09T04:05:00.000Z'); // Sunday early morning in New York

  it('parses weekday and day-part preferences', () => {
    const preferred = parsePreferredDates(
      ['Tuesday', 'morning'],
      now,
      'America/New_York',
    );
    expect(preferred.weekdays.has('tuesday')).toBe(true);
    expect(preferred.dayPart).toBe('morning');
  });

  it('resolves tomorrow relative to the business timezone', () => {
    const preferred = parsePreferredDates(['tomorrow'], now, 'America/New_York');
    expect(preferred.isoDates.has('2026-08-10')).toBe(true);
  });
});
