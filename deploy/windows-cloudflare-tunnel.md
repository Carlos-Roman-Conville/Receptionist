# Voice on Windows — Cloudflare Tunnel (dev / go-live)

Use this when the voice service runs on Carlos's PC (not the VPS Docker stack).
Telnyx needs a public HTTPS webhook and WSS media URL.

## Prerequisites

- `cloudflared` installed (`C:\Program Files (x86)\cloudflared\cloudflared.exe`)
- Cloudflare login done (`C:\Users\rexoc\.cloudflared\cert.pem` exists)
- Tunnel created and DNS routed (see `C:\Users\rexoc\.cloudflared\config.yml`)
- Voice service running: `npm run voice:dev` (port 3001)
- `.env` includes:
  - `VOICE_PUBLIC_WS_URL=wss://voice.crc-solutions.org`
  - `TELNYX_SKIP_SIGNATURE=0` (production — verify Telnyx signatures)
  - `ELEVENLABS_VOICE_ID` set

## Verify (before Telnyx)

```powershell
curl.exe -s https://voice.crc-solutions.org/health
# {"ok":true,"service":"voice",...}

# WebSocket upgrade (101) through tunnel — required for audio
curl.exe -i -N -H "Connection: Upgrade" -H "Upgrade: websocket" `
  "https://voice.crc-solutions.org/media?call_control_id=test"
```

If DNS looks dead locally but Cloudflare edge works, your router may be caching NXDOMAIN. Wait or flush; query `1.1.1.1` or authoritative NS.

## Install as Windows service (survives reboot)

Run **PowerShell as Administrator**:

```powershell
cd "E:\AI Programs\Receptionist"
.\scripts\install-cloudflared-service.ps1
```

Or manually:

```powershell
& "C:\Program Files (x86)\cloudflared\cloudflared.exe" `
  service install `
  --config "C:\Users\rexoc\.cloudflared\config.yml"
```

Check:

```powershell
Get-Service cloudflared
```

## Telnyx (manual go-ahead required)

Create a Call Control Application:

| Field | Value |
|-------|-------|
| Webhook URL | `https://voice.crc-solutions.org/webhooks/telnyx` |
| Connection | assign to **+1 267 487 3609** |

From that moment, inbound calls to 267-487-3609 hit the AI receptionist.

## Chat subdomain

`chat.crc-solutions.org` is currently served by a separate `n8n-chatbot` tunnel elsewhere.
Do **not** add chat to this tunnel until that traffic is migrated to `POST /chat` on the new chat service.

## Pushover smoke test

After voice is wired, send a test alert before relying on emergency routing:

```powershell
npm run async:dev
# POST /run/briefing is separate; use brain emergency tool or a one-off Pushover curl
```

Ask for an explicit Pushover test before firing.
