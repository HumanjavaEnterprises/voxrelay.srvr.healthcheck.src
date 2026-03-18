import type { ProviderBalance } from "../types";

/**
 * Fetch RunPod account balance via GraphQL API.
 *
 * Endpoint: POST https://api.runpod.io/graphql
 * Auth:     Bearer token (RUNPOD_API_KEY)
 *
 * Returns: clientBalance, currentSpendPerHr, spendLimit,
 *          underBalance, notifyLowBalance
 */

const RUNPOD_GRAPHQL_URL = "https://api.runpod.io/graphql";

const BALANCE_QUERY = `
  query {
    myself {
      clientBalance
      currentSpendPerHr
      spendLimit
      minBalance
      underBalance
      notifyLowBalance
    }
  }
`;

interface RunPodMyselfResponse {
  data?: {
    myself: {
      clientBalance: number;
      currentSpendPerHr: number;
      spendLimit: number;
      minBalance: number;
      underBalance: boolean;
      notifyLowBalance: boolean;
    };
  };
  errors?: Array<{ message: string }>;
}

export async function fetchRunPodBalance(
  apiKey: string
): Promise<ProviderBalance> {
  try {
    const res = await fetch(RUNPOD_GRAPHQL_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({ query: BALANCE_QUERY }),
    });

    if (!res.ok) {
      throw new Error(`RunPod API returned ${res.status}: ${res.statusText}`);
    }

    const json = (await res.json()) as RunPodMyselfResponse;

    if (json.errors?.length) {
      throw new Error(json.errors.map((e) => e.message).join("; "));
    }

    const me = json.data!.myself;
    const burnRate = me.currentSpendPerHr;
    const estimatedRunway =
      burnRate > 0 ? me.clientBalance / burnRate : Infinity;

    return {
      provider: "runpod",
      balance: me.clientBalance,
      currency: "USD",
      burnRate,
      burnRateUnit: "per_hour",
      estimatedRunway: Math.round(estimatedRunway * 10) / 10,
      spendLimit: me.spendLimit,
      raw: me as unknown as Record<string, unknown>,
      fetchedAt: new Date().toISOString(),
    };
  } catch (err) {
    return {
      provider: "runpod",
      balance: -1,
      currency: "USD",
      fetchedAt: new Date().toISOString(),
      error: err instanceof Error ? err.message : String(err),
    };
  }
}
