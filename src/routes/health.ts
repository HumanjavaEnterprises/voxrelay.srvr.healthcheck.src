import { Hono } from "hono";
import type { Env, HealthReport } from "../types";
import { fetchRunPodBalance, fetchTwilioBalance } from "../providers";
import { buildAlerts, dispatchAlerts } from "../alerts";

const health = new Hono<{ Bindings: Env }>();

/**
 * GET /v1/health
 *
 * Returns a full health report with balances and alert status.
 * Does NOT dispatch alerts — use POST /v1/health/check or the cron for that.
 *
 * Useful for dashboards, status pages, and ad-hoc checks.
 */
health.get("/v1/health", async (c) => {
  const env = c.env;

  const [runpod, twilio] = await Promise.all([
    fetchRunPodBalance(env.RUNPOD_API_KEY),
    fetchTwilioBalance(env.TWILIO_ACCOUNT_SID, env.TWILIO_AUTH_TOKEN),
  ]);

  const balances = [runpod, twilio];
  const alerts = await buildAlerts(balances, env);

  const hasErrors = balances.some((b) => b.error);
  const hasCritical = alerts.some((a) => a.level === "critical");
  const hasWarn = alerts.some((a) => a.level === "warn");

  const report: HealthReport = {
    status: hasCritical ? "critical" : hasWarn || hasErrors ? "degraded" : "healthy",
    checkedAt: new Date().toISOString(),
    balances,
    alerts,
    version: env.VOXRELAY_VERSION,
    environment: env.ENVIRONMENT,
  };

  // Cache latest report in KV for quick access
  await env.HEALTH_KV.put("latest_report", JSON.stringify(report), {
    expirationTtl: 7200, // 2 hours
  });

  const statusCode = hasCritical ? 503 : hasWarn ? 200 : 200;
  return c.json(report, statusCode);
});

/**
 * POST /v1/health/check
 *
 * Same as GET but also dispatches alerts if thresholds are breached.
 * This is what the cron trigger calls.
 */
health.post("/v1/health/check", async (c) => {
  const env = c.env;

  const [runpod, twilio] = await Promise.all([
    fetchRunPodBalance(env.RUNPOD_API_KEY),
    fetchTwilioBalance(env.TWILIO_ACCOUNT_SID, env.TWILIO_AUTH_TOKEN),
  ]);

  const balances = [runpod, twilio];
  const alerts = await buildAlerts(balances, env);

  // Dispatch active alerts
  await dispatchAlerts(alerts, env);

  const hasCritical = alerts.some((a) => a.level === "critical");
  const hasWarn = alerts.some((a) => a.level === "warn");

  const report: HealthReport = {
    status: hasCritical ? "critical" : hasWarn ? "degraded" : "healthy",
    checkedAt: new Date().toISOString(),
    balances,
    alerts,
    version: env.VOXRELAY_VERSION,
    environment: env.ENVIRONMENT,
  };

  await env.HEALTH_KV.put("latest_report", JSON.stringify(report), {
    expirationTtl: 7200,
  });

  return c.json(report);
});

/**
 * GET /v1/health/last
 *
 * Returns the last cached health report without making fresh API calls.
 * Fast — just reads from KV.
 */
health.get("/v1/health/last", async (c) => {
  const cached = await c.env.HEALTH_KV.get("latest_report");
  if (!cached) {
    return c.json({ error: "No health report cached yet. Run a check first." }, 404);
  }
  return c.json(JSON.parse(cached));
});

export { health };
