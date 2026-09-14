import { getAddress, isAddress } from "viem";
import { ToolError } from "../shared/errors.js";
import type { JsonRecord } from "../types.js";
import { getLifiAddressActivity } from "./lifi.js";
import { getMayanAddressActivity } from "./mayan.js";
import { getAcrossAddressActivity } from "./across.js";

function failure(provider: string, error: unknown): JsonRecord {
  return { provider, available: false, error: { code: error instanceof ToolError ? error.code : "BRIDGE_PROVIDER_ERROR", message: error instanceof Error ? error.message : String(error) } };
}

/** Aggregates independent providers; an outage at one explorer must not hide the other's activity. */
export async function getBridgeAddressActivity(input: { address: string; limit: number; offset: number }): Promise<JsonRecord> {
  if (!isAddress(input.address)) throw new ToolError("address must be a valid 0x-prefixed EVM address.", "INVALID_EVM_ADDRESS");
  const address = getAddress(input.address);
  const [lifi, mayan, across] = await Promise.allSettled([getLifiAddressActivity(input), getMayanAddressActivity(input), getAcrossAddressActivity(input)]);
  const providers: JsonRecord[] = [
    lifi.status === "fulfilled" ? lifi.value : failure("lifi-orders", lifi.reason),
    mayan.status === "fulfilled" ? mayan.value : failure("mayan", mayan.reason),
    across.status === "fulfilled" ? across.value : failure("across", across.reason),
  ];
  const available = providers.filter((provider) => provider.available !== false);
  if (available.length === 0) throw new ToolError("All configured bridge activity providers failed. Inspect the provider errors after retrying.", "BRIDGE_PROVIDER_ERROR");
  const activities = available.flatMap((provider) => Array.isArray(provider.activities)
    ? provider.activities.map((activity) => ({ provider: provider.provider, ...activity as JsonRecord })) : []);
  return { address, providerCount: available.length, activityCount: activities.length, activities, providers };
}
