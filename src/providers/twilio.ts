import type { ProviderBalance } from "../types";

/**
 * Fetch Twilio account balance via REST API.
 *
 * Endpoint: GET https://api.twilio.com/2010-04-01/Accounts/{SID}/Balance.json
 * Auth:     Basic (AccountSid:AuthToken)
 *
 * Returns: { currency, balance, account_sid }
 */

interface TwilioBalanceResponse {
  currency: string;
  balance: string;
  account_sid: string;
}

export async function fetchTwilioBalance(
  accountSid: string,
  authToken: string
): Promise<ProviderBalance> {
  const url = `https://api.twilio.com/2010-04-01/Accounts/${accountSid}/Balance.json`;

  try {
    const res = await fetch(url, {
      headers: {
        Authorization: `Basic ${btoa(`${accountSid}:${authToken}`)}`,
      },
    });

    if (!res.ok) {
      throw new Error(`Twilio API returned ${res.status}: ${res.statusText}`);
    }

    const json = (await res.json()) as TwilioBalanceResponse;

    return {
      provider: "twilio",
      balance: parseFloat(json.balance),
      currency: json.currency,
      raw: json as unknown as Record<string, unknown>,
      fetchedAt: new Date().toISOString(),
    };
  } catch (err) {
    return {
      provider: "twilio",
      balance: -1,
      currency: "USD",
      fetchedAt: new Date().toISOString(),
      error: err instanceof Error ? err.message : String(err),
    };
  }
}
