import type { AlertEvent, Env } from "../types";

/**
 * Dispatch alerts through configured channels.
 * Skips suppressed alerts (within cooldown).
 * Mutates alert.sentVia to record which channels were used.
 */
export async function dispatchAlerts(
  alerts: AlertEvent[],
  env: Env
): Promise<void> {
  const active = alerts.filter((a) => !a.suppressed);
  if (active.length === 0) return;

  const dispatchers: Array<{
    name: string;
    fn: (alerts: AlertEvent[], env: Env) => Promise<void>;
    enabled: boolean;
  }> = [
    {
      name: "slack",
      fn: sendSlack,
      enabled: !!env.SLACK_WEBHOOK_URL,
    },
    {
      name: "sms",
      fn: sendSMS,
      enabled: !!env.ALERT_SMS_TO && !!env.TWILIO_ACCOUNT_SID,
    },
    // TODO: email via Cloudflare Email Workers
  ];

  for (const d of dispatchers) {
    if (!d.enabled) continue;
    try {
      await d.fn(active, env);
      active.forEach((a) => a.sentVia.push(d.name));
    } catch (err) {
      console.error(`Alert dispatch failed [${d.name}]:`, err);
    }
  }
}

// ─── Slack ───────────────────────────────────────────────
async function sendSlack(alerts: AlertEvent[], env: Env): Promise<void> {
  const emoji = { warn: ":warning:", critical: ":rotating_light:" };
  const blocks = alerts.map((a) => ({
    type: "section",
    text: {
      type: "mrkdwn",
      text: `${emoji[a.level as keyof typeof emoji] || ":question:"} ${a.message}`,
    },
  }));

  await fetch(env.SLACK_WEBHOOK_URL!, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      text: `VoxRelay Balance Alert — ${alerts.length} issue(s)`,
      blocks,
    }),
  });
}

// ─── SMS via Twilio ──────────────────────────────────────
async function sendSMS(alerts: AlertEvent[], env: Env): Promise<void> {
  const body = alerts.map((a) => a.message).join("\n");

  const params = new URLSearchParams({
    To: env.ALERT_SMS_TO!,
    From: env.ALERT_SMS_FROM || env.ALERT_SMS_TO!, // fallback
    Body: `VoxRelay Alert:\n${body}`,
  });

  await fetch(
    `https://api.twilio.com/2010-04-01/Accounts/${env.TWILIO_ACCOUNT_SID}/Messages.json`,
    {
      method: "POST",
      headers: {
        Authorization: `Basic ${btoa(`${env.TWILIO_ACCOUNT_SID}:${env.TWILIO_AUTH_TOKEN}`)}`,
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: params.toString(),
    }
  );
}
