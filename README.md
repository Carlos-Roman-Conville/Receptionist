# CRC AI Receptionist

Modular AI receptionist: phone + web chat sharing one brain, configured per client via the Deployment Kit.

## Start here

1. Read `BUILD-PLAN.md` for build order and the web chat module spec
2. Read `RECEPTIONIST-BUILD-SPEC.md` for architecture (refined from the Technical Guide)
3. Read `E:\shared programs\CRC Solutions\CRC-Technical-Guide-Receptionist.md` for full module specs
4. Client config: `E:\shared programs\CRC Solutions\Deployment Kit\clients\crc-solutions\`

## Validate config

```bash
npm run validate:client
# or:
pip install pyyaml
python "E:\shared programs\CRC Solutions\Deployment Kit\validate.py" "E:\shared programs\CRC Solutions\Deployment Kit\clients\crc-solutions"
```

## Dump assembled prompt (Phase 0)

```bash
npm run prompt:dump
```

## Database (Phase 1)

```bash
npm run db:up
npm run db:migrate
```

## Brain CLI (Phase 1 — requires Postgres + ANTHROPIC_API_KEY)

```bash
npm run brain:cli -- "What services do you offer?"
```

## Chat service (Phase 2)

```bash
npm run db:up
npm run db:migrate
npm run chat:dev
# POST http://localhost:3000/chat
```

Widget backend URL: `POST /chat` (legacy `/webhook/chat` alias still supported).

## Voice service (Phase 3)

```bash
npm run db:up
npm run db:migrate
npm run voice:dev
# Telnyx webhooks -> POST /webhooks/telnyx
# Media stream -> WS /media?call_control_id=...
```

Requires `TELNYX_API_KEY`, `DEEPGRAM_API_KEY`, `ELEVENLABS_API_KEY`, `ELEVENLABS_VOICE_ID`, and `EMERGENCY_TRANSFER_NUMBER` in `.env`. Set `VOICE_PUBLIC_WS_URL` to your public WSS URL for Telnyx streaming.

## Async service + n8n (Phase 4)

```bash
npm run async:dev
npm run briefing:run      # manual daily briefing
npm run leads:notify      # manual hot/warm lead emails
```

Import workflows from `n8n/workflows/` (see `n8n/README.md`). Schedule: **6:30 AM** daily briefing, 5-minute lead poll.

Pushover fires immediately on emergency (`send_emergency_alert` tool). SMTP required for briefing and lead emails.

## Website wiring (Phase 5)

Static site: `E:\shared programs\CRC Solutions\Website\website\site-config.js` → `https://chat.crc-solutions.org`

```bash
npm run validate:wiring
```

Production deploy: see `deploy/README.md` (VPS Docker) or `deploy/windows-cloudflare-tunnel.md` (voice on Windows + Cloudflare Tunnel).

## Acceptance tests (Phase 6)

```bash
npm run test:acceptance   # C + P scenarios
npm run acceptance        # full gate: validate.py + all tests + scenarios
```

Manual go-live checklist: `scripts/test-scenarios/README.md`

## Google Calendar OAuth (one-time)

After creating a **Desktop app** OAuth client in Google Cloud Console:

```bash
# 1. Put GOOGLE_CALENDAR_CLIENT_ID and GOOGLE_CALENDAR_CLIENT_SECRET in .env
# 2. Consent once — writes GOOGLE_CALENDAR_REFRESH_TOKEN to .env
npm run calendar:oauth
```

Scope: `https://www.googleapis.com/auth/calendar`. Target calendar ID lives in Deployment Kit `integrations.yaml` (`calendar_id`), not in `.env`.

When `GOOGLE_CALENDAR_*` credentials are set, `check_availability` and `book_appointment` call Google Calendar directly (20-minute consult + 40-minute private buffer). Without credentials, bookings queue to the daily briefing as before.

## Build and test

```bash
npm run build
npm test
```

## Related paths

| Path | Purpose |
|------|---------|
| `E:\shared programs\CRC Solutions\Deployment Kit\` | Client YAML/MD configs |
| `E:\shared programs\CRC Solutions\CRC-Technical-Guide-Receptionist.md` | Architecture and how-to-build |
| `docs/guide-vs-kit-precedence.md` | When Guide and Kit disagree, Kit wins |
| `E:\shared programs\CRC Solutions\Website\` | Chat widget frontend |
| `E:\shared programs\chatbot-update\new-nodes.json` | Legacy chat reference (flow + scoring) |

## Status

Phase 6 complete: automated C1–C8 and P1–P7 acceptance scenarios, `npm run acceptance` gate (validate.py + unit tests + scenarios). Manual production sign-off checklist in `scripts/test-scenarios/README.md`.
