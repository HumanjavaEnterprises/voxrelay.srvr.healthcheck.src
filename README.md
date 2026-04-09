# voxrelay-healthcheck

Balance monitoring and alerting service for the VoxRelay voice AI stack. Runs as a Cloudflare Worker with cron triggers to continuously check account balances across all paid providers and alert you before anything runs dry.

## Why this exists

VoxRelay depends on three paid services that can silently stop working if their balance hits zero:

| Provider   | What it does in VoxRelay            | Billing model        | Risk                                     |
|------------|-------------------------------------|----------------------|------------------------------------------|
| **RunPod**     | GPU-powered TTS (Chatterbox)        | Prepaid credit       | Workers stop, calls go silent            |
| **Twilio**     | Phone numbers, call routing, media  | Prepaid balance      | Inbound/outbound calls stop entirely     |
| **Cloudflare** | Edge compute, Workers AI (STT/LLM)  | Pay-as-you-go + free tier | Lower risk — generous free tier     |

This service queries each provider's billing API on a cron schedule and fires alerts (Slack, SMS, email) when balances drop below configurable thresholds.

## Architecture

```
┌──────────────────────────────────────────────────┐
│          Cloudflare Worker (this service)         │
│                                                    │
│  Cron ──► fetch balances ──► evaluate thresholds  │
│                                    │               │
│                              ┌─────┴──────┐       │
│                              │  Alert?     │       │
│                              └──┬───┬───┬──┘       │
│                          Slack  SMS  Email          │
│                                                    │
│  HTTP API:                                         │
│    GET  /v1/health       → read-only report        │
│    POST /v1/health/check → report + send alerts    │
│    GET  /v1/health/last  → cached last report      │
└──────────────────────────────────────────────────┘
```

## Provider APIs

### RunPod — GraphQL

```
POST https://api.runpod.io/graphql
Authorization: Bearer <RUNPOD_API_KEY>

query {
  myself {
    clientBalance        # current USD credit
    currentSpendPerHr    # burn rate
    spendLimit           # safety cap
    underBalance         # boolean flag
  }
}
```

Key metric: `clientBalance / currentSpendPerHr` = estimated hours of runway.

### Twilio — REST

```
GET https://api.twilio.com/2010-04-01/Accounts/{SID}/Balance.json
Authorization: Basic base64(SID:AuthToken)

Response: { "currency": "USD", "balance": "12.29" }
```

Twilio also supports **UsageTriggers** — webhooks that fire when usage crosses a threshold. We can configure one as a backup alongside this polling approach.

## Setup

```bash
# 1. Install dependencies
npm install

# 2. Copy env vars
cp .dev.vars.example .dev.vars
# Fill in your API keys and thresholds

# 3. Create KV namespace
npx wrangler kv namespace create HEALTH_KV
# Update the ID in wrangler.toml

# 4. Test locally
npm run dev
# Visit http://localhost:8790/v1/health

# 5. Deploy
npm run deploy
```

## Configuration

### Thresholds (in `.dev.vars` or wrangler.toml `[vars]`)

| Variable                  | Default  | Description                         |
|---------------------------|----------|-------------------------------------|
| `RUNPOD_BALANCE_WARN`     | `10.00`  | Warn when RunPod drops below $10    |
| `RUNPOD_BALANCE_CRITICAL` | `3.00`   | Critical when below $3              |
| `TWILIO_BALANCE_WARN`     | `20.00`  | Warn when Twilio drops below $20    |
| `TWILIO_BALANCE_CRITICAL` | `5.00`   | Critical when below $5              |
| `ALERT_COOLDOWN_SECONDS`  | `3600`   | Don't re-alert same condition for 1h|

### Cron Schedule (in `wrangler.toml`)

```toml
[triggers]
crons = [
  "*/30 9-21 * * *",   # Every 30 min during business hours (peak calls)
  "0 */2 * * *"         # Every 2 hours overnight (baseline)
]
```

### Alert Channels

| Channel | Required env vars | Notes |
|---------|-------------------|-------|
| **Slack** | `SLACK_WEBHOOK_URL` | Incoming webhook to a `#voxrelay-alerts` channel |
| **SMS** | `ALERT_SMS_TO`, `ALERT_SMS_FROM` | Uses the same Twilio credentials |
| **Email** | `ALERT_EMAIL_TO` | TODO: via Cloudflare Email Workers |

## API Reference

### `GET /v1/health`

Fetches live balances from all providers and evaluates thresholds. Does **not** dispatch alerts. Use for dashboards and status pages.

**Response** (200 or 503 if critical):

```json
{
  "status": "healthy",
  "checkedAt": "2026-03-17T22:00:00.000Z",
  "balances": [
    {
      "provider": "runpod",
      "balance": 7.99,
      "currency": "USD",
      "burnRate": 0.00053,
      "burnRateUnit": "per_hour",
      "estimatedRunway": 15075.5,
      "fetchedAt": "2026-03-17T22:00:00.123Z"
    },
    {
      "provider": "twilio",
      "balance": 14.20,
      "currency": "USD",
      "fetchedAt": "2026-03-17T22:00:00.456Z"
    }
  ],
  "alerts": [],
  "version": "0.1.0",
  "environment": "production"
}
```

### `POST /v1/health/check`

Same as GET but also dispatches alerts through configured channels when thresholds are breached. This is what the cron calls.

### `GET /v1/health/last`

Returns the last cached health report from KV. Fast — no external API calls. Returns 404 if no report has been cached yet.

## Project Structure

```
voxrelay.srvr.healthcheck.src/
├── src/
│   ├── index.ts              # Worker entry — Hono app + cron handler
│   ├── types.ts              # TypeScript interfaces (Env, ProviderBalance, etc.)
│   ├── providers/
│   │   ├── index.ts          # Re-exports
│   │   ├── runpod.ts         # RunPod GraphQL balance fetch
│   │   ├── twilio.ts         # Twilio REST balance fetch
│   │   └── cloudflare.ts     # Cloudflare billing (stub/TODO)
│   ├── alerts/
│   │   ├── index.ts          # Re-exports
│   │   ├── evaluate.ts       # Threshold evaluation + cooldown logic
│   │   └── dispatch.ts       # Slack, SMS, email dispatch
│   └── routes/
│       └── health.ts         # /v1/health endpoints
├── test/
│   └── test-balances.ts      # Manual balance check script
├── wrangler.toml             # Worker config + cron triggers
├── tsconfig.json
├── package.json
├── .dev.vars.example
├── .gitignore
└── README.md
```

## Roadmap

- [ ] Cloudflare billing provider (Workers AI usage tracking)
- [ ] Twilio UsageTrigger webhook as push-based backup
- [ ] Deepgram balance check (legacy — voiceLLM now uses local Whisper STT)
- [ ] Balance trend tracking in D1 (daily snapshots, burn rate graphs)
- [ ] Runway projection alerts ("RunPod will run out in ~4 hours at current rate")
- [ ] Integration with VoxRelay dashboard (embed health widget)
- [ ] Auto-pause outbound campaigns when balance is critical
- [ ] PagerDuty / Opsgenie integration for on-call alerting
