import { parseCalendarIntegration } from '@receptionist/config';
import type { ClientConfig } from '@receptionist/config';
import { addBriefingItem } from '@receptionist/db';
import type { ToolExecutionContext, ToolExecutionResult } from '../tools/types.js';
import { formatSlotLabel } from '../time-context.js';
import { googleCalendarFetch } from './client.js';
import { loadGoogleCalendarEnv } from './env.js';

interface BookableService {
  name: string;
  durationMinutes: number;
  bufferMinutes: number;
}

interface BusyInterval {
  start: Date;
  end: Date;
}

const SLOT_STEP_MINUTES = 30;

function getBookableService(config: ClientConfig): BookableService | null {
  const service = config.services.services?.find((s) => s.bookable_directly === true);
  if (!service) return null;

  const durationMinutes = Number(service.duration_minutes);
  const bufferMinutes = Number(service.buffer_minutes);
  if (!Number.isFinite(durationMinutes) || !Number.isFinite(bufferMinutes)) {
    return null;
  }

  return {
    name: service.name,
    durationMinutes,
    bufferMinutes,
  };
}

function getTimezone(config: ClientConfig): string {
  return String(config.businessDetails.hours?.timezone ?? 'America/New_York');
}

function getMinNoticeHours(config: ClientConfig): number {
  const policy = config.services.pricing_policy as
    | { min_notice_hours?: number | string }
    | undefined;
  const value = policy?.min_notice_hours ?? config.services.min_notice_hours;
  const hours = Number(value);
  return Number.isFinite(hours) ? hours : 24;
}

function isSoftMinNotice(config: ClientConfig): boolean {
  const policy = config.services.pricing_policy as
    | { min_notice_enforcement?: string }
    | undefined;
  const enforcement = String(
    policy?.min_notice_enforcement ??
      config.services.min_notice_enforcement ??
      'soft',
  );
  return enforcement.toLowerCase() === 'soft';
}

function parseDayHours(
  day:
    | { open?: string | null; close?: string | null; by_appointment?: boolean }
    | undefined,
): { open: string; close: string } | null {
  if (!day) return null;
  if (day.by_appointment && (day.open == null || day.close == null)) {
    return null;
  }
  if (typeof day.open === 'string' && typeof day.close === 'string') {
    return { open: day.open, close: day.close };
  }
  return null;
}

function localDateParts(date: Date, timeZone: string) {
  const formatter = new Intl.DateTimeFormat('en-US', {
    timeZone,
    weekday: 'long',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  });
  const parts = formatter.formatToParts(date);
  const get = (type: string) => parts.find((p) => p.type === type)?.value ?? '';
  return {
    weekday: get('weekday').toLowerCase(),
    hour: Number(get('hour')),
    minute: Number(get('minute')),
  };
}

function parseClock(time: string): { hour: number; minute: number } {
  const [hour, minute] = time.split(':').map((v) => Number(v));
  return { hour, minute };
}

function addMinutes(date: Date, minutes: number): Date {
  return new Date(date.getTime() + minutes * 60_000);
}

/** Round up to the next clean :00/:30 so callers hear "10 AM", not "10:25". */
function ceilToStep(date: Date, stepMinutes: number): Date {
  const stepMs = stepMinutes * 60_000;
  return new Date(Math.ceil(date.getTime() / stepMs) * stepMs);
}

function overlaps(aStart: Date, aEnd: Date, bStart: Date, bEnd: Date): boolean {
  return aStart < bEnd && aEnd > bStart;
}

function mergeBusyIntervals(intervals: BusyInterval[]): BusyInterval[] {
  const sorted = [...intervals].sort(
    (a, b) => a.start.getTime() - b.start.getTime(),
  );
  const merged: BusyInterval[] = [];
  for (const interval of sorted) {
    const last = merged[merged.length - 1];
    if (!last || interval.start > last.end) {
      merged.push({ ...interval });
      continue;
    }
    if (interval.end > last.end) {
      last.end = interval.end;
    }
  }
  return merged;
}

async function queryBusyIntervals(
  env: NonNullable<ReturnType<typeof loadGoogleCalendarEnv>>,
  calendarId: string,
  timeMin: Date,
  timeMax: Date,
  timeZone: string,
): Promise<BusyInterval[]> {
  const response = await googleCalendarFetch(env, '/freeBusy', {
    method: 'POST',
    body: JSON.stringify({
      timeMin: timeMin.toISOString(),
      timeMax: timeMax.toISOString(),
      timeZone,
      items: [{ id: calendarId }],
    }),
  });

  const payload = (await response.json()) as {
    calendars?: Record<
      string,
      { busy?: Array<{ start?: string; end?: string }> }
    >;
    error?: { message?: string };
  };

  if (!response.ok) {
    throw new Error(payload.error?.message ?? 'Google freeBusy query failed');
  }

  const busy = payload.calendars?.[calendarId]?.busy ?? [];
  return mergeBusyIntervals(
    busy
      .filter((slot) => slot.start && slot.end)
      .map((slot) => ({
        start: new Date(String(slot.start)),
        end: new Date(String(slot.end)),
      })),
  );
}

function generateCandidateSlots(
  config: ClientConfig,
  service: BookableService,
  timeMin: Date,
  timeMax: Date,
  busy: BusyInterval[],
): Date[] {
  const timeZone = getTimezone(config);
  const regular = config.businessDetails.hours?.regular ?? {};
  const totalBlockMinutes = service.durationMinutes + service.bufferMinutes;
  const slots: Date[] = [];

  for (
    let cursor = new Date(timeMin);
    cursor < timeMax && slots.length < 12;
    cursor = addMinutes(cursor, SLOT_STEP_MINUTES)
  ) {
    const { weekday, hour, minute } = localDateParts(cursor, timeZone);
    const dayHours = parseDayHours(
      regular[weekday as keyof typeof regular] as
        | { open?: string | null; close?: string | null; by_appointment?: boolean }
        | undefined,
    );
    if (!dayHours) continue;

    const open = parseClock(dayHours.open);
    const close = parseClock(dayHours.close);
    const slotEnd = addMinutes(cursor, totalBlockMinutes);
    const slotEndParts = localDateParts(slotEnd, timeZone);

    const afterOpen =
      hour > open.hour || (hour === open.hour && minute >= open.minute);
    const beforeClose =
      slotEndParts.hour < close.hour ||
      (slotEndParts.hour === close.hour && slotEndParts.minute <= close.minute);

    if (!afterOpen || !beforeClose) continue;

    const blocked = busy.some((interval) =>
      overlaps(cursor, slotEnd, interval.start, interval.end),
    );
    if (blocked) continue;

    slots.push(new Date(cursor));
  }

  return slots.slice(0, 5);
}

export function calendarConfigured(config: ClientConfig): boolean {
  return (
    loadGoogleCalendarEnv() !== null && parseCalendarIntegration(config) !== null
  );
}

export async function checkAvailability(
  ctx: ToolExecutionContext,
  input: Record<string, unknown>,
): Promise<ToolExecutionResult> {
  const env = loadGoogleCalendarEnv();
  const integration = parseCalendarIntegration(ctx.config);
  const service = getBookableService(ctx.config);

  if (!env || !integration || !service) {
    return {
      ok: true,
      message:
        'Availability check queued. Calendar integration executes in Phase 2.',
      data: input,
    };
  }

  const timeZone = getTimezone(ctx.config);
  const now = new Date();
  const timeMin = ceilToStep(addMinutes(now, 60), SLOT_STEP_MINUTES);
  const timeMax = new Date(now.getTime() + 7 * 24 * 60 * 60_000);

  const busy = await queryBusyIntervals(
    env,
    integration.calendarId,
    timeMin,
    timeMax,
    timeZone,
  );
  const slots = generateCandidateSlots(
    ctx.config,
    service,
    timeMin,
    timeMax,
    busy,
  );

  return {
    ok: true,
    message:
      slots.length > 0
        ? `Found ${slots.length} open consultation slot(s): ${slots
            .map((slot) => formatSlotLabel(slot, timeZone))
            .join('; ')}`
        : 'No open consultation slots in the next week.',
    data: {
      // Spoken labels for the caller; ISO values for book_appointment.
      slots_local: slots.map((slot) => formatSlotLabel(slot, timeZone)),
      slots: slots.map((slot) => slot.toISOString()),
      duration_minutes: service.durationMinutes,
      buffer_minutes: service.bufferMinutes,
      timezone: timeZone,
    },
  };
}

async function maybeFlagShortNoticeBooking(
  ctx: ToolExecutionContext,
  startTime: Date,
): Promise<void> {
  const minNoticeHours = getMinNoticeHours(ctx.config);
  const soft = isSoftMinNotice(ctx.config);
  const threshold = addMinutes(new Date(), minNoticeHours * 60);

  if (startTime >= threshold || !soft) {
    return;
  }

  await addBriefingItem(ctx.pool, {
    clientSlug: ctx.clientSlug,
    itemType: 'booking',
    summary: `Short-notice booking at ${startTime.toISOString()}`,
    metadata: { start_time: startTime.toISOString(), soft_notice: true },
  });
}

export async function bookAppointment(
  ctx: ToolExecutionContext,
  input: Record<string, unknown>,
): Promise<ToolExecutionResult> {
  const env = loadGoogleCalendarEnv();
  const integration = parseCalendarIntegration(ctx.config);
  const service = getBookableService(ctx.config);

  if (!env || !integration || !service) {
    await addBriefingItem(ctx.pool, {
      clientSlug: ctx.clientSlug,
      itemType: 'booking',
      summary: `Booking requested for ${String(input.start_time ?? 'TBD')}`,
      metadata: input,
    });
    return {
      ok: true,
      message: 'Appointment booking queued for calendar write.',
      data: input,
    };
  }

  const startTime = new Date(String(input.start_time ?? ''));
  if (Number.isNaN(startTime.getTime())) {
    return { ok: false, message: 'Invalid start_time for booking.' };
  }

  const attendeeName = String(input.name ?? 'Consultation guest');
  const attendeeEmail =
    typeof input.email === 'string' && input.email.includes('@')
      ? input.email.trim()
      : undefined;
  const consultEnd = addMinutes(startTime, service.durationMinutes);
  const bufferEnd = addMinutes(startTime, service.durationMinutes + service.bufferMinutes);

  const consultBody = {
    summary: `${service.name}: ${attendeeName}`,
    description: [
      `Booked via AI receptionist (${ctx.channel}).`,
      input.phone ? `Phone: ${String(input.phone)}` : null,
      input.service_name ? `Service: ${String(input.service_name)}` : null,
    ]
      .filter(Boolean)
      .join('\n'),
    start: { dateTime: startTime.toISOString(), timeZone: getTimezone(ctx.config) },
    end: { dateTime: consultEnd.toISOString(), timeZone: getTimezone(ctx.config) },
    attendees: attendeeEmail ? [{ email: attendeeEmail }] : undefined,
    sendUpdates: attendeeEmail ? 'all' : 'none',
  };

  const consultResponse = await googleCalendarFetch(
    env,
    `/calendars/${encodeURIComponent(integration.calendarId)}/events`,
    {
      method: 'POST',
      body: JSON.stringify(consultBody),
    },
  );

  const consultEvent = (await consultResponse.json()) as {
    id?: string;
    htmlLink?: string;
    error?: { message?: string };
  };

  if (!consultResponse.ok || !consultEvent.id) {
    await addBriefingItem(ctx.pool, {
      clientSlug: ctx.clientSlug,
      itemType: 'booking',
      summary: `Booking failed for ${startTime.toISOString()}`,
      metadata: { ...input, error: consultEvent.error?.message ?? 'unknown' },
    });
    return {
      ok: false,
      message: consultEvent.error?.message ?? 'Google Calendar booking failed.',
      data: input,
    };
  }

  const bufferBody = {
    summary: 'Consultation buffer',
    description: `Private hold after ${service.name}.`,
    start: { dateTime: consultEnd.toISOString(), timeZone: getTimezone(ctx.config) },
    end: { dateTime: bufferEnd.toISOString(), timeZone: getTimezone(ctx.config) },
    visibility: 'private',
    transparency: 'opaque',
  };

  await googleCalendarFetch(
    env,
    `/calendars/${encodeURIComponent(integration.calendarId)}/events`,
    {
      method: 'POST',
      body: JSON.stringify(bufferBody),
    },
  );

  await maybeFlagShortNoticeBooking(ctx, startTime);

  return {
    ok: true,
    message: 'Appointment booked on Google Calendar.',
    data: {
      event_id: consultEvent.id,
      html_link: consultEvent.htmlLink ?? null,
      start_time: startTime.toISOString(),
      duration_minutes: service.durationMinutes,
      buffer_minutes: service.bufferMinutes,
    },
  };
}

export async function rescheduleAppointment(
  ctx: ToolExecutionContext,
  input: Record<string, unknown>,
): Promise<ToolExecutionResult> {
  const env = loadGoogleCalendarEnv();
  const integration = parseCalendarIntegration(ctx.config);
  const service = getBookableService(ctx.config);

  if (!env || !integration || !service) {
    return {
      ok: true,
      message: `${'reschedule_appointment'} queued for calendar integration.`,
      data: input,
    };
  }

  const originalStart = new Date(String(input.original_start ?? ''));
  const newStart = new Date(String(input.new_start ?? ''));
  if (Number.isNaN(originalStart.getTime()) || Number.isNaN(newStart.getTime())) {
    return { ok: false, message: 'Invalid original_start or new_start.' };
  }

  const events = await listEventsNear(
    env,
    integration.calendarId,
    originalStart,
    service.durationMinutes + service.bufferMinutes,
  );

  if (events.length === 0) {
    return { ok: false, message: 'No matching calendar event found to reschedule.' };
  }

  const consultEvent = events[0];
  const consultEnd = addMinutes(newStart, service.durationMinutes);
  const bufferEnd = addMinutes(newStart, service.durationMinutes + service.bufferMinutes);

  await patchEvent(env, integration.calendarId, consultEvent.id, {
    start: { dateTime: newStart.toISOString(), timeZone: getTimezone(ctx.config) },
    end: { dateTime: consultEnd.toISOString(), timeZone: getTimezone(ctx.config) },
  });

  if (events[1]) {
    await patchEvent(env, integration.calendarId, events[1].id, {
      start: { dateTime: consultEnd.toISOString(), timeZone: getTimezone(ctx.config) },
      end: { dateTime: bufferEnd.toISOString(), timeZone: getTimezone(ctx.config) },
    });
  }

  await maybeFlagShortNoticeBooking(ctx, newStart);

  return {
    ok: true,
    message: 'Appointment rescheduled on Google Calendar.',
    data: { event_id: consultEvent.id, new_start: newStart.toISOString() },
  };
}

export async function cancelAppointment(
  ctx: ToolExecutionContext,
  input: Record<string, unknown>,
): Promise<ToolExecutionResult> {
  const env = loadGoogleCalendarEnv();
  const integration = parseCalendarIntegration(ctx.config);
  const service = getBookableService(ctx.config);

  if (!env || !integration || !service) {
    return {
      ok: true,
      message: `${'cancel_appointment'} queued for calendar integration.`,
      data: input,
    };
  }

  const startTime = new Date(String(input.start_time ?? ''));
  if (Number.isNaN(startTime.getTime())) {
    return { ok: false, message: 'Invalid start_time for cancellation.' };
  }

  const events = await listEventsNear(
    env,
    integration.calendarId,
    startTime,
    service.durationMinutes + service.bufferMinutes,
  );

  if (events.length === 0) {
    return { ok: false, message: 'No matching calendar event found to cancel.' };
  }

  for (const event of events) {
    await deleteEvent(env, integration.calendarId, event.id);
  }

  return {
    ok: true,
    message: 'Appointment cancelled on Google Calendar.',
    data: { cancelled_event_ids: events.map((event) => event.id) },
  };
}

async function listEventsNear(
  env: NonNullable<ReturnType<typeof loadGoogleCalendarEnv>>,
  calendarId: string,
  startTime: Date,
  totalMinutes: number,
): Promise<Array<{ id: string }>> {
  const timeMin = addMinutes(startTime, -15);
  const timeMax = addMinutes(startTime, totalMinutes + 15);
  const response = await googleCalendarFetch(
    env,
    `/calendars/${encodeURIComponent(calendarId)}/events?${new URLSearchParams({
      timeMin: timeMin.toISOString(),
      timeMax: timeMax.toISOString(),
      singleEvents: 'true',
      orderBy: 'startTime',
    }).toString()}`,
  );

  const payload = (await response.json()) as {
    items?: Array<{ id?: string }>;
    error?: { message?: string };
  };

  if (!response.ok) {
    throw new Error(payload.error?.message ?? 'Google Calendar list failed');
  }

  return (payload.items ?? []).filter(
    (item): item is { id: string } => typeof item.id === 'string',
  );
}

async function patchEvent(
  env: NonNullable<ReturnType<typeof loadGoogleCalendarEnv>>,
  calendarId: string,
  eventId: string,
  body: Record<string, unknown>,
): Promise<void> {
  const response = await googleCalendarFetch(
    env,
    `/calendars/${encodeURIComponent(calendarId)}/events/${encodeURIComponent(eventId)}`,
    {
      method: 'PATCH',
      body: JSON.stringify(body),
    },
  );

  if (!response.ok) {
    const payload = (await response.json()) as { error?: { message?: string } };
    throw new Error(payload.error?.message ?? 'Google Calendar patch failed');
  }
}

async function deleteEvent(
  env: NonNullable<ReturnType<typeof loadGoogleCalendarEnv>>,
  calendarId: string,
  eventId: string,
): Promise<void> {
  const response = await googleCalendarFetch(
    env,
    `/calendars/${encodeURIComponent(calendarId)}/events/${encodeURIComponent(eventId)}`,
    { method: 'DELETE' },
  );

  if (!response.ok && response.status !== 404) {
    const payload = (await response.json()) as { error?: { message?: string } };
    throw new Error(payload.error?.message ?? 'Google Calendar delete failed');
  }
}
