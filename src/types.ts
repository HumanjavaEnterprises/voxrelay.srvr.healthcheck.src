// ─── Environment Bindings ────────────────────────────────
export interface Env {
  // KV for alert state & balance cache
  HEALTH_KV: KVNamespace;

  // RunPod
  RUNPOD_API_KEY: string;

  // Twilio
  TWILIO_ACCOUNT_SID: string;
  TWILIO_AUTH_TOKEN: string;

  // Cloudflare (optional)
  CLOUDFLARE_ACCOUNT_ID?: string;
  CLOUDFLARE_API_TOKEN?: string;

  // Thresholds
  RUNPOD_BALANCE_WARN: string;
  RUNPOD_BALANCE_CRITICAL: string;
  TWILIO_BALANCE_WARN: string;
  TWILIO_BALANCE_CRITICAL: string;

  // Alert channels
  SLACK_WEBHOOK_URL?: string;
  ALERT_SMS_TO?: string;
  ALERT_SMS_FROM?: string;
  ALERT_EMAIL_TO?: string;

  // Cooldown
  ALERT_COOLDOWN_SECONDS: string;

  // Meta
  ENVIRONMENT: string;
  VOXRELAY_VERSION: string;
}

// ─── Provider Balance ────────────────────────────────────
export interface ProviderBalance {
  provider: "runpod" | "twilio" | "cloudflare";
  balance: number;
  currency: string;
  burnRate?: number;        // $/hr spend rate (RunPod)
  burnRateUnit?: string;    // "per_hour" | "per_day"
  estimatedRunway?: number; // hours until $0 at current burn
  spendLimit?: number;      // provider-side cap if set
  raw?: Record<string, unknown>; // full API response for debugging
  fetchedAt: string;        // ISO timestamp
  error?: string;           // if fetch failed
}

// ─── Alert Levels ────────────────────────────────────────
export type AlertLevel = "ok" | "warn" | "critical";

export interface AlertThresholds {
  warn: number;
  critical: number;
}

// ─── Health Report ───────────────────────────────────────
export interface HealthReport {
  status: "healthy" | "degraded" | "critical";
  checkedAt: string;
  balances: ProviderBalance[];
  alerts: AlertEvent[];
  version: string;
  environment: string;
}

// ─── Alert Event ─────────────────────────────────────────
export interface AlertEvent {
  provider: string;
  level: AlertLevel;
  message: string;
  balance: number;
  threshold: number;
  sentVia: string[];       // ["slack", "sms", "email"]
  suppressed: boolean;     // true if within cooldown
  timestamp: string;
}
