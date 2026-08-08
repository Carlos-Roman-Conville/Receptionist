import { parse as parseYaml } from 'yaml';
import type { ClientConfig } from './load.js';

export interface CalendarIntegration {
  calendarId: string;
}

export function parseCalendarIntegration(
  config: ClientConfig,
): CalendarIntegration | null {
  if (config.moduleConfig.modules.calendar_management !== true) {
    return null;
  }

  const doc = parseYaml(config.integrationsRaw) as {
    calendar?: { calendar_id?: string };
  };
  const calendarId = doc.calendar?.calendar_id?.trim();
  if (!calendarId) {
    return null;
  }

  return { calendarId };
}
