# AI Receptionist — Agent Instructions

Read before writing any code.

## Sources of truth

1. **Architecture (how to build):** `E:\shared programs\CRC Solutions\CRC-Technical-Guide-Receptionist.md`
2. **Implementation summary:** `RECEPTIONIST-BUILD-SPEC.md`
3. **Build order and scope:** `BUILD-PLAN.md`
4. **Client config (what to build with):** `E:\shared programs\CRC Solutions\Deployment Kit\clients\<slug>\`
5. **Scope gate:** `module-config.yaml` — build ONLY modules set to `true`
6. **Precedence:** `docs/guide-vs-kit-precedence.md` — Deployment Kit overrides Technical Guide

## Hard rules

- **No client facts in code.** Business name, phones, hours, scripts load from Deployment Kit at startup.
- **n8n is async only.** Never put the live audio loop through n8n.
- **Phone and chat share one brain** (`packages/brain`) and one config loader (`packages/config`).
- **validate.py must PASS** before go-live.
- **Secrets in `.env` only.** Never commit `.env`. No password manager yet — local `.env` is the vault.
- **Quote placeholders with colons** in YAML: `"<<FILL: ...>>"`

## CRC deployment (crc-solutions)

Active modules: phone_handling, web_chat, calendar_management, call_screening, daily_briefing, emergency_routing.

Web chat: clean rebuild. Legacy n8n workflow is reference for lead scoring flow only. Widget lives in `E:\shared programs\Website\`.

Notifications: Pushover for owner alerts; Google Calendar invite for caller confirmation (SMS deferred until 10DLC).

## Stack

Telnyx, Deepgram, Claude API, ElevenLabs, Google Calendar, PostgreSQL, n8n (async), Pushover (alerts).
