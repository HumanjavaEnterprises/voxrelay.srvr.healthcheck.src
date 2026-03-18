import { Hono } from "hono";
import { cors } from "hono/cors";
import type { Env } from "./types";
import { health } from "./routes/health";
import { fetchRunPodBalance, fetchTwilioBalance } from "./providers";
import { buildAlerts, dispatchAlerts } from "./alerts";

const app = new Hono<{ Bindings: Env }>();

// ─── Middleware ───────────────────────────────────────────
app.use("*", cors());

// ─── Routes ──────────────────────────────────────────────
app.route("/", health);

// ─── Root ────────────────────────────────────────────────
app.get("/", (c) =>
  c.json({
    service: "voxrelay-healthcheck",
    version: c.env.VOXRELAY_VERSION,
    endpoints: {
      "GET  /v1/health":       "Full health report (read-only, no alerts)",
      "POST /v1/health/check": "Health check + dispatch alerts if needed",
      "GET  /v1/health/last":  "Last cached report from KV (fast)",
    },
  })
);

// ─── Cron Handler ────────────────────────────────────────
// Triggered by wrangler.toml [triggers].crons
async function handleCron(
  _event: ScheduledEvent,
  env: Env,
  ctx: ExecutionContext
): Promise<void> {
  console.log(`[cron] Health check triggered at ${new Date().toISOString()}`);

  const [runpod, twilio] = await Promise.all([
    fetchRunPodBalance(env.RUNPOD_API_KEY),
    fetchTwilioBalance(env.TWILIO_ACCOUNT_SID, env.TWILIO_AUTH_TOKEN),
  ]);

  const balances = [runpod, twilio];
  const alerts = await buildAlerts(balances, env);

  // Dispatch in background so we don't block the cron
  ctx.waitUntil(dispatchAlerts(alerts, env));

  // Cache report
  const report = {
    status: alerts.some((a) => a.level === "critical")
      ? "critical"
      : alerts.some((a) => a.level === "warn")
        ? "degraded"
        : "healthy",
    checkedAt: new Date().toISOString(),
    balances,
    alerts,
    version: env.VOXRELAY_VERSION,
    environment: env.ENVIRONMENT,
  };

  await env.HEALTH_KV.put("latest_report", JSON.stringify(report), {
    expirationTtl: 7200,
  });

  console.log(
    `[cron] Done. Status: ${report.status}, RunPod: $${runpod.balance}, Twilio: $${twilio.balance}`
  );
}

// ─── Export ──────────────────────────────────────────────
export default {
  fetch: app.fetch,
  scheduled: handleCron,
};
