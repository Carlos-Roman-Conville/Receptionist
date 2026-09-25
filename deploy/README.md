# Production deployment — crc-solutions

Wire **crc-solutions.org** (static site) to the Receptionist services on a VPS.

## DNS (Carlos)

| Host | Points to | Service |
|------|-----------|---------|
| `chat.crc-solutions.org` | VPS public IP | Chat API (`:3000`) |
| `voice.crc-solutions.org` | VPS public IP | Voice webhooks + media WS (`:3001`) |

The marketing site stays on existing hosting (e.g. Cloudflare Pages). Only API subdomains hit the VPS.

## Stack on VPS

```bash
cp deploy/crc-solutions.env.example .env
# fill secrets, then:
docker compose -f docker-compose.yml -f deploy/docker-compose.prod.yml up -d
```

Services:

| Container | Port | Role |
|-----------|------|------|
| `postgres` | 5432 | State |
| `chat` | 3000 | `POST /chat`, `POST /contact` |
| `voice` | 3001 | Telnyx webhooks, media WS |
| `async` | 3002 | n8n HTTP triggers |
| `n8n` | 5678 | Scheduled briefing + lead poll |
| `caddy` | 443 | TLS termination, reverse proxy |

## Website wiring

Static site (`E:\shared programs\CRC Solutions\Website\website\`) loads `site-config.js`:

```javascript
window.CRC_RECEPTIONIST_API = 'https://chat.crc-solutions.org';
```

`main.js` uses that base for:

- Chat widget → `POST /chat`
- Contact form → `POST /contact`

Set `CHAT_ALLOWED_ORIGINS=https://crc-solutions.org` on the chat service.

## Verify

```bash
npm run validate:client
npm run validate:wiring
curl -s https://chat.crc-solutions.org/health
```

## Legacy

The portfolio n8n chat workflow under `Website/n8n-workflow/` is **reference only**. Do not point production traffic at it.
