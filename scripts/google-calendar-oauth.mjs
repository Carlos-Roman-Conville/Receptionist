#!/usr/bin/env node
/**
 * One-time Google Calendar OAuth consent for a Desktop app client.
 *
 * Prerequisites:
 *   1. Enable Google Calendar API in Google Cloud Console
 *   2. OAuth consent screen includes scope: https://www.googleapis.com/auth/calendar
 *   3. Create OAuth client → Desktop app
 *   4. Set GOOGLE_CALENDAR_CLIENT_ID and GOOGLE_CALENDAR_CLIENT_SECRET in .env
 *
 * If you used Web application instead, add this redirect URI in Console:
 *   http://127.0.0.1:8080/oauth2callback
 */
import { createServer } from 'node:http';
import { execFile } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { config as loadEnv } from 'dotenv';

const GOOGLE_CALENDAR_SCOPE = 'https://www.googleapis.com/auth/calendar';
const REDIRECT_URI = 'http://127.0.0.1:8080/oauth2callback';
const PORT = 8080;
const TIMEOUT_MS = 5 * 60 * 1000;

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const envPath = join(root, '.env');

loadEnv({ path: envPath });

const clientId = process.env.GOOGLE_CALENDAR_CLIENT_ID?.trim();
const clientSecret = process.env.GOOGLE_CALENDAR_CLIENT_SECRET?.trim();

if (!clientId || !clientSecret) {
  console.error(
    'Missing GOOGLE_CALENDAR_CLIENT_ID or GOOGLE_CALENDAR_CLIENT_SECRET in .env',
  );
  console.error('');
  console.error('Steps:');
  console.error('  1. Google Cloud Console → APIs → enable Google Calendar API');
  console.error('  2. OAuth consent screen → add scope:');
  console.error(`     ${GOOGLE_CALENDAR_SCOPE}`);
  console.error('  3. Credentials → Create OAuth client → Desktop app');
  console.error('  4. Paste client ID and secret into .env, then re-run:');
  console.error('     npm run calendar:oauth');
  process.exit(1);
}

function upsertEnvVar(filePath, key, value) {
  const line = `${key}=${value}`;
  if (!existsSync(filePath)) {
    writeFileSync(filePath, `${line}\n`, 'utf8');
    return;
  }

  const content = readFileSync(filePath, 'utf8');
  const pattern = new RegExp(`^${key}=.*$`, 'm');
  if (pattern.test(content)) {
    writeFileSync(filePath, content.replace(pattern, line), 'utf8');
    return;
  }

  const suffix = content.endsWith('\n') ? '' : '\n';
  writeFileSync(filePath, `${content}${suffix}${line}\n`, 'utf8');
}

function openBrowser(url) {
  const platform = process.platform;
  if (platform === 'win32') {
    execFile('rundll32', ['url.dll,FileProtocolHandler', url], {
      windowsHide: true,
    });
    return;
  }
  if (platform === 'darwin') {
    execFile('open', [url]);
    return;
  }
  execFile('xdg-open', [url]);
}

function buildAuthUrl(state) {
  const params = new URLSearchParams({
    client_id: clientId,
    redirect_uri: REDIRECT_URI,
    response_type: 'code',
    scope: GOOGLE_CALENDAR_SCOPE,
    access_type: 'offline',
    prompt: 'consent',
    state,
  });
  return `https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}`;
}

async function exchangeCodeForTokens(code) {
  const body = new URLSearchParams({
    code,
    client_id: clientId,
    client_secret: clientSecret,
    redirect_uri: REDIRECT_URI,
    grant_type: 'authorization_code',
  });

  const response = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body,
  });

  const payload = await response.json();
  if (!response.ok) {
    throw new Error(
      payload.error_description || payload.error || `HTTP ${response.status}`,
    );
  }
  return payload;
}

function htmlPage(title, body) {
  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <title>${title}</title>
  <style>
    body { font-family: system-ui, sans-serif; max-width: 40rem; margin: 3rem auto; line-height: 1.5; }
    code { background: #f4f4f4; padding: 0.1rem 0.3rem; border-radius: 4px; }
  </style>
</head>
<body>${body}</body>
</html>`;
}

const state = randomBytes(16).toString('hex');
const authUrl = buildAuthUrl(state);
const startUrl = `http://127.0.0.1:${PORT}/`;

console.log('Google Calendar OAuth — one-time consent');
console.log(`Scope: ${GOOGLE_CALENDAR_SCOPE}`);
console.log(`Redirect: ${REDIRECT_URI}`);
console.log('');
console.log('Opening browser for consent...');
console.log('If nothing opens, visit this URL manually:');
console.log(startUrl);
console.log('');

const server = createServer(async (req, res) => {
  try {
    const requestUrl = new URL(req.url ?? '/', `http://127.0.0.1:${PORT}`);

    if (requestUrl.pathname === '/') {
      res.writeHead(302, { Location: authUrl });
      res.end();
      return;
    }

    if (requestUrl.pathname !== '/oauth2callback') {
      res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
      res.end('Not found');
      return;
    }

    const error = requestUrl.searchParams.get('error');
    if (error) {
      res.writeHead(400, { 'Content-Type': 'text/html; charset=utf-8' });
      res.end(
        htmlPage(
          'Authorization failed',
          `<h1>Authorization failed</h1><p>${error}</p><p>You can close this tab.</p>`,
        ),
      );
      finish(new Error(`Google OAuth error: ${error}`));
      return;
    }

    const returnedState = requestUrl.searchParams.get('state');
    if (returnedState !== state) {
      res.writeHead(400, { 'Content-Type': 'text/html; charset=utf-8' });
      res.end(
        htmlPage(
          'Invalid state',
          '<h1>Invalid OAuth state</h1><p>Try running <code>npm run calendar:oauth</code> again.</p>',
        ),
      );
      finish(new Error('OAuth state mismatch'));
      return;
    }

    const code = requestUrl.searchParams.get('code');
    if (!code) {
      res.writeHead(400, { 'Content-Type': 'text/html; charset=utf-8' });
      res.end(
        htmlPage(
          'Missing code',
          '<h1>Missing authorization code</h1><p>Try again from the start.</p>',
        ),
      );
      finish(new Error('Missing authorization code'));
      return;
    }

    const tokens = await exchangeCodeForTokens(code);
    if (!tokens.refresh_token) {
      res.writeHead(400, { 'Content-Type': 'text/html; charset=utf-8' });
      res.end(
        htmlPage(
          'No refresh token',
          `<h1>No refresh token returned</h1>
           <p>Revoke app access at
           <a href="https://myaccount.google.com/permissions">Google Account permissions</a>,
           then run <code>npm run calendar:oauth</code> again.</p>`,
        ),
      );
      finish(
        new Error(
          'No refresh_token in response. Revoke prior access and retry with prompt=consent.',
        ),
      );
      return;
    }

    upsertEnvVar(envPath, 'GOOGLE_CALENDAR_REFRESH_TOKEN', tokens.refresh_token);

    res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
    res.end(
      htmlPage(
        'Calendar connected',
        `<h1>Calendar connected</h1>
         <p><code>GOOGLE_CALENDAR_REFRESH_TOKEN</code> was saved to <code>.env</code>.</p>
         <p>You can close this tab and return to the terminal.</p>`,
      ),
    );

    console.log('');
    console.log('Success: GOOGLE_CALENDAR_REFRESH_TOKEN written to .env');
    console.log('Calendar target is configured in Deployment Kit integrations.yaml (calendar_id).');
    console.log('Never commit .env.');
    finish(null);
  } catch (err) {
    res.writeHead(500, { 'Content-Type': 'text/html; charset=utf-8' });
    res.end(
      htmlPage(
        'Token exchange failed',
        `<h1>Token exchange failed</h1><p>${String(err)}</p>`,
      ),
    );
    finish(err instanceof Error ? err : new Error(String(err)));
  }
});

function finish(err) {
  clearTimeout(timeout);
  if (err) {
    console.error(err.message);
  }
  server.close(() => {
    process.exit(err ? 1 : 0);
  });
}

const timeout = setTimeout(() => {
  console.error('Timed out waiting for OAuth callback (5 minutes).');
  finish(new Error('OAuth timeout'));
}, TIMEOUT_MS);

server.on('error', (err) => {
  if (err.code === 'EADDRINUSE') {
    console.error(`Port ${PORT} is in use. Close the other process and retry.`);
  } else {
    console.error(err.message);
  }
  process.exit(1);
});

server.listen(PORT, '127.0.0.1', () => {
  console.log(`Listening on ${startUrl} — keep this terminal open until consent finishes.`);
  console.log('');
  openBrowser(startUrl);
});
