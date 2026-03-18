/**
 * Quick manual test — fetch balances from both providers.
 *
 * Usage: npx tsx test/test-balances.ts
 *
 * Requires .dev.vars to be present (or set env vars manually).
 */

import { config } from "dotenv";
config({ path: ".dev.vars" });

async function main() {
  const { fetchRunPodBalance } = await import("../src/providers/runpod");
  const { fetchTwilioBalance } = await import("../src/providers/twilio");

  console.log("─── RunPod ─────────────────────────");
  const runpod = await fetchRunPodBalance(process.env.RUNPOD_API_KEY || "");
  console.log(JSON.stringify(runpod, null, 2));

  console.log("\n─── Twilio ─────────────────────────");
  const twilio = await fetchTwilioBalance(
    process.env.TWILIO_ACCOUNT_SID || "",
    process.env.TWILIO_AUTH_TOKEN || ""
  );
  console.log(JSON.stringify(twilio, null, 2));

  // Quick threshold check
  console.log("\n─── Summary ────────────────────────");
  const rBal = runpod.balance;
  const tBal = twilio.balance;
  console.log(`RunPod:  $${rBal >= 0 ? rBal.toFixed(2) : "ERROR"}`);
  console.log(`Twilio:  $${tBal >= 0 ? tBal.toFixed(2) : "ERROR"}`);

  if (runpod.burnRate && runpod.burnRate > 0) {
    console.log(
      `RunPod burn:  $${runpod.burnRate.toFixed(4)}/hr → ~${runpod.estimatedRunway}h runway`
    );
  }
}

main().catch(console.error);
