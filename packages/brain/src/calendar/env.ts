export interface GoogleCalendarEnv {
  clientId: string;
  clientSecret: string;
  refreshToken: string;
}

export function loadGoogleCalendarEnv(): GoogleCalendarEnv | null {
  const clientId = process.env.GOOGLE_CALENDAR_CLIENT_ID?.trim();
  const clientSecret = process.env.GOOGLE_CALENDAR_CLIENT_SECRET?.trim();
  const refreshToken = process.env.GOOGLE_CALENDAR_REFRESH_TOKEN?.trim();

  if (!clientId || !clientSecret || !refreshToken) {
    return null;
  }

  return { clientId, clientSecret, refreshToken };
}
