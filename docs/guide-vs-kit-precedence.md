# Guide vs Kit Precedence

**Rule: When the Technical Guide and Deployment Kit disagree, the Deployment Kit wins.**

The Technical Guide (`CRC-Technical-Guide-Receptionist.md`) describes the product generically. The Deployment Kit (`clients/<slug>/`) holds this client's verified facts, compliance decisions, and scope. Code and prompts load from the Kit at runtime.

---

## Document roles

| Document | Contains | Used by |
|----------|----------|---------|
| CRC-Technical-Guide-Receptionist.md | Architecture, providers, module specs, deployment checklist | Humans and agents planning builds |
| RECEPTIONIST-BUILD-SPEC.md | Refined architecture (Node realtime + n8n async) | This repo |
| Deployment Kit / clients / crc-solutions / | Business facts, compliance, scope, integrations status | Config loader + prompt assembler |
| module-config.yaml | Which modules are ON/OFF | Tool gating only — not RAG |
| integrations.yaml | Access status, calendar ID, alerting — no secrets | Plumbing only — not RAG |

---

## Resolved conflicts (crc-solutions)

### 1. AI disclosure

- **Guide (Section 2):** "Never says 'I'm an AI' unless directly asked (or unless required by local law)."
- **Kit (compliance.yaml):** `inbound_disclosure_required: true`, first line before anything else.
- **Resolution:** Kit wins. Every inbound call and chat open includes disclosure.

### 2. Conversation length cap

- **Guide (Section 6):** "conversation exceeds 5 minutes"
- **Kit (compliance.yaml):** `soft_cap_minutes: 8`, `hard_cap_minutes: 11`
- **Resolution:** Kit wins.

### 3. SMS confirmation and owner notification

- **Guide (Part VI critical tests):** SMS confirmation to caller after booking; owner notification SMS after every call.
- **Kit:** `sms_handling: false`, 10DLC not started.
- **Resolution:** Substitute channels documented in integrations.yaml:
  - **Caller confirmation:** Google Calendar invite (`caller_confirmation_channel: google_calendar_invite`)
  - **Owner notification:** Pushover push (`owner_notification_channel: pushover`)

### 4. Message taking / CRM

- **Guide (Base System):** `log_to_crm()` writes to client's CRM.
- **Kit:** `data_entry: false`, CRM has no API.
- **Resolution:** Write to local Postgres call log and daily briefing. No CRM tool in this build.

### 5. Daily briefing data source

- **Guide:** "Requires Data Entry module or at minimum a local call log database."
- **Kit:** `data_entry: false`, `daily_briefing: true`.
- **Resolution:** Postgres call log satisfies the requirement. Briefing reads from DB.

### 6. Web chat transport

- **Guide:** "Visitor types a message, it hits CRC's server via websocket."
- **Reality:** Existing widget uses `fetch` POST to `/webhook/chat`.
- **Resolution:** Chat service uses HTTP POST, not WebSocket. Same brain, same tools; transport matches the widget.

---

## What not to merge into prompts

Per Deployment Kit README, these files must **never** enter the assembled system prompt:

- `module-config.yaml` (scope only)
- `integrations.yaml` (plumbing only)

Tools are **gated** by module-config; integration status affects whether a tool can execute at runtime, not what the model knows about the business.
