#!/usr/bin/env node
/**
 * Phase 5 wiring checks — validates env + Deployment Kit alignment for go-live.
 */
import { config as loadEnv } from 'dotenv';
import { loadClientConfigFromEnv } from '@receptionist/config';

loadEnv();

const errors = [];
const warnings = [];

try {
  const config = loadClientConfigFromEnv();

  if (!config.moduleConfig.modules.web_chat) {
    errors.push('web_chat module is disabled');
  }

  const origins = (process.env.CHAT_ALLOWED_ORIGINS ?? '')
    .split(',')
    .map((v) => v.trim())
    .filter(Boolean);

  const identity = config.businessDetails.identity ?? {};
  const website = String(identity.website ?? '');

  if (origins.length === 0) {
    warnings.push('CHAT_ALLOWED_ORIGINS is empty');
  } else if (website) {
    let siteOrigin = website;
    try {
      siteOrigin = new URL(website).origin;
    } catch {
      /* keep raw website string */
    }
    if (!origins.includes(siteOrigin)) {
      warnings.push(`CHAT_ALLOWED_ORIGINS should include ${siteOrigin}`);
    }
  }

  if (!process.env.DATABASE_URL) errors.push('DATABASE_URL is required');
  if (!process.env.ANTHROPIC_API_KEY) warnings.push('ANTHROPIC_API_KEY not set');
  if (!process.env.SMTP_HOST) warnings.push('SMTP not configured (briefing/contact email skipped)');
  if (!process.env.PUSHOVER_APP_TOKEN) warnings.push('Pushover not configured (emergency push skipped)');

  const publicWs = process.env.VOICE_PUBLIC_WS_URL ?? '';
  if (publicWs.startsWith('ws://') && !publicWs.includes('localhost')) {
    warnings.push('VOICE_PUBLIC_WS_URL should use wss:// in production');
  }
} catch (err) {
  errors.push(err instanceof Error ? err.message : String(err));
}

for (const w of warnings) console.warn(`WARN: ${w}`);
for (const e of errors) console.error(`FAIL: ${e}`);

if (errors.length) process.exit(1);
console.log('Wiring validation passed.');
