import type {
  ProviderBalance,
  AlertLevel,
  AlertThresholds,
  AlertEvent,
  Env,
} from "../types";

/**
 * Evaluate a single provider's balance against thresholds.
 * Returns the appropriate alert level.
 */
export function evaluateBalance(
  balance: ProviderBalance,
  thresholds: AlertThresholds
): AlertLevel {
  if (balance.error || balance.balance < 0) return "critical"; // fetch failed
  if (balance.balance <= thresholds.critical) return "critical";
  if (balance.balance <= thresholds.warn) return "warn";
  return "ok";
}

/**
 * Build alert events for all providers.
 * Checks cooldown via KV to avoid spamming.
 */
export async function buildAlerts(
  balances: ProviderBalance[],
  env: Env
): Promise<AlertEvent[]> {
  const alerts: AlertEvent[] = [];

  const thresholdsMap: Record<string, AlertThresholds> = {
    runpod: {
      warn: parseFloat(env.RUNPOD_BALANCE_WARN),
      critical: parseFloat(env.RUNPOD_BALANCE_CRITICAL),
    },
    twilio: {
      warn: parseFloat(env.TWILIO_BALANCE_WARN),
      critical: parseFloat(env.TWILIO_BALANCE_CRITICAL),
    },
  };

  const cooldownSeconds = parseInt(env.ALERT_COOLDOWN_SECONDS, 10) || 3600;

  for (const bal of balances) {
    const thresholds = thresholdsMap[bal.provider];
    if (!thresholds) continue; // skip providers without thresholds (e.g. CF)

    const level = evaluateBalance(bal, thresholds);
    if (level === "ok") continue;

    // Check cooldown
    const cooldownKey = `alert:${bal.provider}:${level}`;
    const lastAlert = await env.HEALTH_KV.get(cooldownKey);
    const suppressed = lastAlert !== null;

    const threshold =
      level === "critical" ? thresholds.critical : thresholds.warn;

    const message = bal.error
      ? `[${bal.provider.toUpperCase()}] Failed to fetch balance: ${bal.error}`
      : `[${bal.provider.toUpperCase()}] Balance ${level.toUpperCase()}: $${bal.balance.toFixed(2)} (threshold: $${threshold.toFixed(2)})`;

    alerts.push({
      provider: bal.provider,
      level,
      message,
      balance: bal.balance,
      threshold,
      sentVia: [],        // filled by dispatch step
      suppressed,
      timestamp: new Date().toISOString(),
    });

    // Set cooldown if not suppressed (we'll actually send)
    if (!suppressed) {
      await env.HEALTH_KV.put(cooldownKey, new Date().toISOString(), {
        expirationTtl: cooldownSeconds,
      });
    }
  }

  return alerts;
}
