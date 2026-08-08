import type { GoogleCalendarEnv } from './env.js';

let cachedAccessToken: { token: string; expiresAt: number } | null = null;

export async function getGoogleAccessToken(
  env: GoogleCalendarEnv,
): Promise<string> {
  if (cachedAccessToken && Date.now() < cachedAccessToken.expiresAt - 60_000) {
    return cachedAccessToken.token;
  }

  const body = new URLSearchParams({
    client_id: env.clientId,
    client_secret: env.clientSecret,
    refresh_token: env.refreshToken,
    grant_type: 'refresh_token',
  });

  const response = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body,
  });

  const payload = (await response.json()) as {
    access_token?: string;
    expires_in?: number;
    error?: string;
    error_description?: string;
  };

  if (!response.ok || !payload.access_token) {
    throw new Error(
      payload.error_description ||
        payload.error ||
        `Google token refresh failed (${response.status})`,
    );
  }

  cachedAccessToken = {
    token: payload.access_token,
    expiresAt: Date.now() + (payload.expires_in ?? 3600) * 1000,
  };

  return payload.access_token;
}

export async function googleCalendarFetch(
  env: GoogleCalendarEnv,
  path: string,
  init?: RequestInit,
): Promise<Response> {
  const token = await getGoogleAccessToken(env);
  const url = path.startsWith('https://')
    ? path
    : `https://www.googleapis.com/calendar/v3${path}`;

  return fetch(url, {
    ...init,
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
      ...(init?.headers ?? {}),
    },
  });
}

export function resetGoogleAccessTokenCache(): void {
  cachedAccessToken = null;
}
