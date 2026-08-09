# CRC AI Receptionist — Build Specification

Internal implementation reference derived from [CRC-Technical-Guide-Receptionist.md](E:/shared%20programs/Business%20Model/CRC-Technical-Guide-Receptionist.md) (August 2026), refined for the split architecture: **real-time Node service for live channels**, **n8n for async work only**.

When the Guide and Deployment Kit conflict, **the Kit wins**. See [docs/guide-vs-kit-precedence.md](docs/guide-vs-kit-precedence.md).

Source of truth for *what* to build with: `E:\shared programs\CRC Solutions\Deployment Kit\clients\<slug>\`

---

## Principles

1. **Platform-neutral delivery** — tooling follows the client's problem, not CRC preferences.
2. **Working-System Guarantee** — deployments pass agreed acceptance tests before final payment.
3. **Modular architecture** — each module is independently scoped, built, tested, and deployable.
4. **API-first infrastructure** — VPS hosts CRC code; heavy compute runs on third-party APIs.
5. **Client-agnostic code** — no business name, phone number, hours, or scripts in source files. All client facts load from `clients/<slug>/` at startup.

---

## Architecture (refined)

The Technical Guide says "n8n for orchestration" at a high level. That applies to **async** workflows only. The live call loop cannot run through n8n.

```
┌─────────────────────────────────────────────────────────────────┐
│                         VPS (Node.js)                           │
│  ┌──────────────────┐    ┌──────────────────────────────────┐ │
│  │  Voice Service   │    │  Chat Service (HTTP)              │ │
│  │  Telnyx WS loop  │    │  POST /chat                       │ │
│  └────────┬─────────┘    └──────────────┬───────────────────┘ │
│           │                              │                      │
│           └──────────────┬───────────────┘                      │
│                          ▼                                      │
│              ┌─────────────────────┐                            │
│              │   Brain (shared)    │                            │
│              │  Prompt assembler     │                            │
│              │  Claude + tools       │                            │
│              │  Classifier           │                            │
│              └──────────┬────────────┘                            │
│                         │                                       │
│              ┌──────────▼────────────┐                            │
│              │  Config loader        │                            │
│              │  clients/<slug>/      │                            │
│              └──────────┬────────────┘                            │
│                         │                                       │
│              ┌──────────▼────────────┐                            │
│              │  PostgreSQL           │                            │
│              └───────────────────────┘                            │
└─────────────────────────────────────────────────────────────────┘
```

### Stack

| Layer | Provider | Role |
|-------|----------|------|
| Telephony | Telnyx | Numbers, webhooks, media WebSocket, transfers, recording |
| STT | Deepgram Nova-2 | Streaming speech-to-text |
| LLM | Claude API | Brain, tool calls, structured chat JSON |
| TTS | ElevenLabs Turbo | Streaming voice synthesis |
| Calendar | Google Calendar API | Availability check, book/reschedule/cancel |
| State | PostgreSQL | Sessions, call log, transcripts, leads, retention |
| Async | n8n | Briefings, email alerts, scheduled jobs |
| Alerts | Pushover | Emergency notifications |

### Knowledge loading

Shared RAG loads into the system prompt at boot (~8k tokens). No vector DB for typical deployments. See Deployment Kit README for file manifest.

---

## Phone call flow

1. Call arrives via Telnyx media WebSocket
2. Disclosure + recording notice (compliance.yaml)
3. Deepgram STT → Claude brain → ElevenLabs TTS (streaming, barge-in)
4. Tool execution in parallel
5. Post-call log to Postgres; n8n for briefing aggregation

### Latency target

End-to-end first speech: **< 1.2 s**

---

## System prompt (7 sections)

Identity, Personality, Services, Rules, Tools, Escalation, Boundaries — assembled from Deployment Kit files. Channel overlays for phone vs web_chat.

---

## CRC scope (module-config.yaml)

**ON:** phone_handling, web_chat, calendar_management, call_screening, daily_briefing, emergency_routing

**OFF:** email, SMS, data_entry, intake, follow-ups, document drafting, bilingual, CRM lookup, background research

---

## Booking (CRC)

- Caller-facing: 20 minutes
- Calendar: 20-min event + 40-min private buffer
- Min notice: 24h preferred, soft enforcement

---

## References

- **Technical Guide (architecture):** `E:\shared programs\CRC Solutions\CRC-Technical-Guide-Receptionist.md`
- **Deployment Kit (client config):** `E:\shared programs\CRC Solutions\Deployment Kit\`
- **Guide vs Kit precedence:** [docs/guide-vs-kit-precedence.md](docs/guide-vs-kit-precedence.md)
- Website widget: `E:\shared programs\Website\website\chat-widget.js`
- Legacy chat reference: `E:\shared programs\chatbot-update\new-nodes.json`
