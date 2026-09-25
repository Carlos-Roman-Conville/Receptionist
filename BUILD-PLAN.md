# CRC AI Receptionist — Build Plan

**Client:** crc-solutions  
**Status:** Phase 6 — Acceptance tests  
**Architecture guide:** `E:\shared programs\CRC Solutions\CRC-Technical-Guide-Receptionist.md`  
**Precedence:** `docs/guide-vs-kit-precedence.md`
**Config:** `E:\shared programs\CRC Solutions\Deployment Kit\clients\crc-solutions\`  
**Website:** `E:\shared programs\CRC Solutions\Website\`  
**Legacy chat:** Taken down. Rebuild clean. Reference: `E:\shared programs\chatbot-update\new-nodes.json`

---

## 1. Goal

Phone and web chat share **one brain** reading **one Deployment Kit**. Scope from `module-config.yaml`: 6 modules ON, 9 OFF.

---

## 2. Architecture

| Component | Tech | Role |
|-----------|------|------|
| Voice service | Node + Fastify + ws | Telnyx media loop, STT/TTS, barge-in |
| Chat service | Node + Fastify | `POST /chat`, shared brain |
| Brain | TypeScript | Prompt assembly, Claude, tools, classifier |
| Config loader | TypeScript | `clients/<slug>/` at startup |
| Database | PostgreSQL | Sessions, calls, transcripts, leads |
| Async | n8n | Daily briefing, lead emails |
| Alerts | Pushover | Emergency push (parallel with transfer) |

**n8n never sits in the audio path.**

Full diagram: `RECEPTIONIST-BUILD-SPEC.md`

---

## 3. Repository structure

```
receptionist/
├── packages/config/     # YAML loader, prompt assembler
├── packages/brain/      # Claude, tools, classifier
├── packages/voice/      # Telnyx + Deepgram + ElevenLabs
├── packages/chat/       # HTTP chat API (§6)
├── packages/db/         # Postgres migrations
├── clients/crc-solutions/   # → Deployment Kit symlink
├── n8n/workflows/
└── scripts/test-scenarios/
```

**Hard rule:** zero client-specific strings in `packages/`.

---

## 4. Build order

| Phase | Work | Milestone |
|-------|------|-----------|
| **0** | Repo, config loader, validate.py in CI | Prompt CLI for crc-solutions |
| **1** | Postgres + brain + classifier | Tools gated by module-config |
| **2** | **Chat module (§6)** | Widget → new `/chat`, books consultation |
| **3** | Voice service | Test call books + emergency transfer |
| **4** | n8n async | 6:30 AM briefing email |
| **5** | Website wiring | crc-solutions.org → new backend |
| **6** | Acceptance tests | All P/C scenarios pass |

---

## 5. Service connections

```
Website chat-widget.js ──POST /chat──► Chat Service ──┐
                                                       ├──► Brain ──► Claude
Voice Service (Telnyx WS) ─────────────────────────────┘       │
                                                                 ├──► Google Calendar
                                                                 ├──► Telnyx transfer
                                                                 ├──► ntfy alert
                                                                 └──► Postgres

n8n ◄── Postgres ──► SMTP → carlos@crc-solutions.org
```

---

## 6. Web Chat Module (clean rebuild)

### 6.1 Intent

Old n8n chat is **reference only** for conversation flow and lead scoring. Rebuild from scratch on the shared brain.

| Keep | Replace |
|------|---------|
| Email gate (widget) | Same widget UI |
| Intent + lead scoring rubric | Brain channel overlay |
| Natural qualifying flow | Deployment Kit prompt |
| Short text replies | Not hardcoded JS string |

| Fix | How |
|-----|-----|
| Hardcoded facts | Config loader |
| CORS `*` | `CHAT_ALLOWED_ORIGINS=https://crc-solutions.org` |
| Client-side rate limit | Server: 20 msg/hr per session + IP in Postgres |
| JSON.parse crash | Single parse + try/catch fallback |
| n8n staticData race | Postgres sessions with row lock |
| Portfolio gmail | `LEAD_NOTIFY_EMAIL=carlos@crc-solutions.org` |
| No disclosure | First bot message from compliance.yaml |
| Founding client / price hints | Removed — never_say enforced |
| "Never confirm booked" | **Removed** — `books_directly: true` |

### 6.2 API

**`POST /chat`**

Request:
```json
{ "message": "...", "sessionId": "sess_...", "email": "...", "timestamp": "ISO-8601" }
```

Do **not** trust `messageCount` from client.

Success response:
```json
{ "reply": "...", "leadScore": "hot|warm|cold|null", "action": "none|request_availability|end_conversation|booked", "error": null }
```

Errors: 400 (no email), 403 (bad Origin), 429 (rate limit).

### 6.3 Server flow

1. Validate Origin → `CHAT_ALLOWED_ORIGINS`
2. Validate email
3. Load/create Postgres session (sessionId bound to email)
4. Server-side rate limit
5. First turn → inject disclosure from compliance.yaml
6. `brain.respond({ channel: 'web_chat', ... })` → Claude JSON schema
7. Parse once; fallback reply on failure
8. Execute book tool if action requires
9. Hot/warm/booked → queue lead email to carlos@crc-solutions.org
10. Return JSON

### 6.4 Shared brain

```typescript
brain.respond({ channel: 'phone' | 'web_chat', sessionId, userMessage, history, clientSlug })
```

Same kit files. Channel overlay changes output format only (prose vs JSON) and disclosure delivery (spoken vs text).

### 6.5 Chat channel overlay

- JSON-only output (legacy schema — proven)
- Disclosure on first message
- Consultation: **20 minutes**, book directly when ready
- Lead scoring: hot = clear pain + wants consult; warm = vague; cold = browsing
- Never quote prices; never deny AI

### 6.6 Website changes (`E:\shared programs\CRC Solutions\Website\`)

Minimal:

1. `main.js` — point `webhookUrl` at new chat service when deployed
2. `chat-widget.js` — stop sending `messageCount`; optional disclosure-aware greeting
3. Remove old n8n chat workflow references

Widget UI unchanged. Backend 100% new.

### 6.7 Lead notification

Hot/warm/booked → Postgres lead row → n8n or SMTP → **carlos@crc-solutions.org**

Include: email, score, intent, last message, session id.

---

## 7. Failure modes

| Failure | Phone | Chat |
|---------|-------|------|
| Claude timeout | Filler → retry → take message | Fallback JSON reply |
| Calendar down | Collect times; flag briefing | Same |
| Transfer fails | CRC voicemail + push | N/A |
| Parse error | N/A | Graceful reply, log raw |

---

## 8. Test plan

### Chat (C-scenarios)

| # | Input | Expected |
|---|-------|----------|
| C1 | "How much?" | No price; free 20-min consult |
| C2 | "Real person?" | AI disclosure |
| C3 | Hot lead | Book or collect times; score hot |
| C4 | Vendor spam | Decline; cold |
| C5 | 25 msgs / 10 min | 429 |
| C6 | No email | 400 |
| C7 | Bad Origin | 403 |
| C8 | Same Q as phone | Identical answer |

### Phone (P-scenarios)

P1 booking (20+40), P2 emergency+push, P3 recording decline, P4 spam screen, P5 barge-in, P6 soft cap, P7 next-morning book.

### Gate

```bash
python validate.py clients/crc-solutions
```

Blockers until Carlos fills: `calendar_id`, `credential_storage.vault`.

---

## 9. Needs from Carlos

| When | Item |
|------|------|
| Phase 0 | calendar_id, OAuth, vault name, EMERGENCY_TRANSFER_NUMBER, ntfy topic |
| Phase 1 | ElevenLabs voice choice |
| Phase 3 | Telnyx Connection on number |
| Phase 5 | DNS chat.crc-solutions.org |
| Phase 6 | Acceptance sign-off, enable forwarding |

---

## 10. Definition of done

- validate.py PASS
- All P + C scenarios pass; C8 matches phone
- Briefing at 6:30 AM
- Emergency transfer + push on real device
- Recording decline = metadata only
- Widget live on new backend
- No client strings in packages/
- Second client = copy `_template/` only

---

## 11. Out of scope

Email, SMS, intake, follow-ups, CRM entry, documents, bilingual, caller lookup, background research. Do not stub or mention as available.

---

## 12. Applied config decisions

| Topic | Decision |
|-------|----------|
| Consultation | Say 20 min; calendar 20+40 |
| 24h notice | Soft |
| Emergency | ntfy + simultaneous dial |
| Caps | Soft 8 / hard 11 min |
| Recording decline | Metadata only |
| Chat booking | Direct (`books_directly: true`) |
| Architecture | Node realtime + n8n async |
