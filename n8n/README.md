# n8n async workflows

n8n handles **scheduled and polled async work only**. Live phone/chat never flows through n8n.

## Prerequisites

1. Async service running: `npm run async:dev` (port 3002)
2. Postgres reachable from n8n (same `DATABASE_URL` data)
3. `.env` SMTP + optional `ASYNC_WEBHOOK_SECRET`

## Workflows

| File | Schedule | Action |
|------|----------|--------|
| `workflows/daily-briefing-0630.json` | 6:30 AM America/New_York | `POST /run/briefing` |
| `workflows/lead-notify-poll.json` | Every 5 minutes | `POST /run/leads` |

## Import

1. Open n8n → **Workflows** → **Import from File**
2. Import each JSON file under `workflows/`
3. Set environment variable `RECEPTIONIST_ASYNC_URL` (e.g. `http://host.docker.internal:3002`)
4. Set `RECEPTIONIST_ASYNC_SECRET` if `ASYNC_WEBHOOK_SECRET` is configured
5. Activate workflows

## Manual runs (without n8n)

```bash
npm run briefing:run
npm run leads:notify
```

## Architecture

```
Postgres (briefing items, leads, calls)
        │
        ▼
  @receptionist/async  ──SMTP──► owner email (from module-config recipients)
        ▲
        │
   n8n cron / poll (HTTP triggers)
```

Pushover emergency alerts fire **immediately** from the brain (`send_emergency_alert` tool), not via n8n.
