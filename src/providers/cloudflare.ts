import type { ProviderBalance } from "../types";

/**
 * Fetch Cloudflare Workers AI usage (optional provider).
 *
 * Endpoint: GET https://api.cloudflare.com/client/v4/accounts/{id}/billing/profile
 * Auth:     Bearer token (CLOUDFLARE_API_TOKEN)
 *
 * Note: Workers on the free plan have included usage.
 *       Paid plans have usage-based billing.
 *       This is lower priority than RunPod/Twilio for VoxRelay.
 *
 * TODO: Implement once Cloudflare billing API details are confirmed.
 *       For now returns a stub.
 */

export async function fetchCloudflareBalance(
  _accountId: string,
  _apiToken: string
): Promise<ProviderBalance> {
  // TODO: Implement Cloudflare billing API query
  // For now, CF Workers has generous free tier and prepaid plans
  // don't have the same "balance runs out" risk as RunPod/Twilio
  return {
    provider: "cloudflare",
    balance: -1,
    currency: "USD",
    fetchedAt: new Date().toISOString(),
    error: "Not implemented — Cloudflare billing check is optional",
  };
}
