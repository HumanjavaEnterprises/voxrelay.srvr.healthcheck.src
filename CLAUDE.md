# CLAUDE.md — voxrelay.srvr.healthcheck.src

## What This Is

Balance monitoring and alerting service for the VoxRelay voice AI stack. Polls RunPod (GPU/TTS) and Twilio (phone/routing) billing APIs on a cron schedule, evaluates configurable thresholds, and fires alerts (Slack, SMS) when balances drop too low. Runs as a Cloudflare Worker with KV for cooldown state and report caching.

Cloudflare billing is stubbed out (low risk due to generous free tier).

## Tech Stack

- **Runtime:** Cloudflare Workers (Hono framework)
- **Storage:** Workers KV (`HEALTH_KV`) for alert cooldown + cached reports
- **Language:** TypeScript 5, ES2022 target
- **Build:** Wrangler 3 (bundles directly, no separate build step)
- **Scheduling:** Cron triggers via `wrangler.toml`

## Project Structure

```
src/
  index.ts              # Worker entry — Hono app + cron handler
  types.ts              # Env, ProviderBalance, AlertEvent, HealthReport
  providers/
    runpod.ts           # RunPod GraphQL balance fetch
    twilio.ts           # Twilio REST balance fetch
    cloudflare.ts       # Stub (TODO)
    index.ts            # Re-exports
  alerts/
    evaluate.ts         # Threshold evaluation + KV cooldown logic
    dispatch.ts         # Slack webhook + Twilio SMS dispatch
    index.ts            # Re-exports
  routes/
    health.ts           # /v1/health endpoints (GET, POST, GET /last)
test/
  test-balances.ts      # Manual balance check script (npx tsx)
wrangler.toml           # Worker config, cron triggers, KV binding, vars
```

## Commands

```bash
npm install             # Install deps
npm run dev             # Local dev server on :8790
npm run deploy          # Deploy to Cloudflare Workers
npm run typecheck       # tsc --noEmit
npx wrangler deploy --dry-run  # Verify build without deploying
```

## Required Secrets (set via `wrangler secret put` or `.dev.vars`)

| Secret | Purpose |
|--------|---------|
| `RUNPOD_API_KEY` | RunPod GraphQL API bearer token |
| `TWILIO_ACCOUNT_SID` | Twilio account SID (also used for SMS alerts) |
| `TWILIO_AUTH_TOKEN` | Twilio auth token |
| `SLACK_WEBHOOK_URL` | Slack incoming webhook (optional) |
| `ALERT_SMS_TO` | Phone number to receive SMS alerts (optional) |
| `ALERT_SMS_FROM` | Twilio number to send from (optional) |

## Non-Secret Vars (in `wrangler.toml [vars]`)

`RUNPOD_BALANCE_WARN`, `RUNPOD_BALANCE_CRITICAL`, `TWILIO_BALANCE_WARN`, `TWILIO_BALANCE_CRITICAL`, `ALERT_COOLDOWN_SECONDS`, `ENVIRONMENT`, `VOXRELAY_VERSION`

## Cron Schedule

- `*/30 9-21 * * *` — Every 30 min during business hours (peak calls)
- `0 */2 * * *` — Every 2 hours overnight (baseline)

## API Endpoints

| Method | Path | Description |
|--------|------|-------------|
| GET | `/` | Service info + endpoint list |
| GET | `/v1/health` | Live balance report (no alerts dispatched) |
| POST | `/v1/health/check` | Balance report + dispatch alerts if thresholds breached |
| GET | `/v1/health/last` | Last cached report from KV (fast, no API calls) |

Status codes: 200 healthy/warn, 503 critical, 404 no cached report yet.

## Related Repos

- `voxrelay.srvr.voiceLLM.src` — Voice LLM Worker (TTS/STT on RunPod)
- `voxrelay.srvr.dell-voiceLLM.src` — Sovereign call engine on Dell Blackwell (Deepgram STT/TTS + local LLM)
- `voxrelay.srvr.pipecat.src` — Pipecat-based voice pipeline on Dell
- `voxrelay.app.web.src` — Web dashboard (React + CF Pages)
- `voxrelay.app.web-lite.src` — Lite tier frontend

**Note:** The Dell sovereign path (`dell-voiceLLM` / `pipecat`) has different cost monitoring needs — no RunPod dependency, Deepgram is the only paid external service (STT/TTS). Twilio still applies for phone routing.

## Working Rules

- Secrets go in `.dev.vars` locally, `wrangler secret put` for prod. Never commit secrets.
- Admin endpoints return 404 not 403.
- KV TTL for cached reports: 2 hours. Alert cooldown default: 1 hour.
- Provider fetch failures return `balance: -1` and trigger critical alerts.
