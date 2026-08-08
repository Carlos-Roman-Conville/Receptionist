# Acceptance tests (Phase 6)

Automated coverage for BUILD-PLAN §8 **C** and **P** scenarios.

## Run

```bash
npm run acceptance          # full gate: validate.py + unit tests + scenarios
npm run test:acceptance     # scenario tests only
```

## Scenario map

| ID | Automated | Notes |
|----|-----------|-------|
| C1 | Yes | Prompt guardrails + mocked reply — no pricing, 20-min consult |
| C2 | Yes | Disclosure in prompt + web overlay |
| C3 | Yes | Hot lead score in API response |
| C4 | Yes | Cold / screen-out score |
| C5 | Yes | 429 rate limit |
| C6 | Yes | 400 missing email |
| C7 | Yes | 403 bad Origin |
| C8 | Yes | Same factual reply phone vs web (mocked Claude) |
| P1 | Yes | Booking tool queues item; kit has 20+40 min |
| P2 | Yes | Transfer + Pushover on emergency |
| P3 | Yes | Recording decline → DB flag |
| P4 | Yes | SCREEN_OUT classifier |
| P5 | Yes | Barge-in generation cancel |
| P6 | Yes | Soft 8 / hard 11 min caps from kit |
| P7 | Yes | Soft 24h notice allows next-morning book stub |

## Manual sign-off (production)

Before go-live payment, Carlos confirms on real devices:

- [ ] Live call books consultation (Google Calendar OAuth connected)
- [ ] Emergency transfer rings `EMERGENCY_TRANSFER_NUMBER` + Pushover received
- [ ] Widget on crc-solutions.org reaches `chat.crc-solutions.org`
- [ ] 6:30 AM briefing email received
- [ ] Telnyx forwarding enabled per integrations.yaml routing

Record sign-off date in Deployment Kit `meta.verified_on` when complete.
