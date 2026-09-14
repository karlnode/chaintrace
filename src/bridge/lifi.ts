import { getAddress, isAddress } from "viem";
import { ToolError } from "../shared/errors.js";
import { jsonSafe } from "../shared/json.js";
import type { JsonRecord } from "../types.js";

const DEFAULT_LIFI_ORDERS_URL = "https://order.li.fi/orders";

function record(value: unknown): JsonRecord | null {
  return value !== null && typeof value === "object" && !Array.isArray(value) ? value as JsonRecord : null;
}

function list(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

function string(value: unknown): string | null {
  return value === undefined || value === null ? null : String(value);
}

function activity(value: unknown): JsonRecord | null {
  const entry = record(value);
  const order = record(entry?.order);
  const quote = record(entry?.quote);
  const meta = record(entry?.meta);
  const output = record(list(order?.outputs)[0]);
  if (!entry || !order || !meta) return null;
  return {
    id: string(meta.orderIdentifier) ?? string(order.nonce),
    status: string(meta.orderStatus),
    source: {
      chainId: string(order.originChainId) ?? string(quote?.fromChainNetworkId),
      token: string(meta.sendingTokenAddress) ?? string(quote?.fromAssetAddress),
      amount: string(meta.sendingTokenAmount) ?? string(quote?.inputAmount),
      transactionHash: string(meta.orderInitiatedTxHash),
    },
    destination: {
      chainId: string(output?.chainId) ?? string(quote?.toChainNetworkId),
      token: string(meta.receivingTokenAddress) ?? string(quote?.toAssetAddress),
      amount: string(meta.receivingTokenAmount) ?? string(quote?.outputAmount),
      recipient: string(meta.destinationAddress) ?? string(output?.recipient),
      deliveryTransactionHash: string(meta.orderDeliveredTxHash),
    },
    settlement: {
      transactionHash: string(meta.orderSettledTxHash),
      refundTransactionHash: string(meta.refundTxHash),
    },
    timestamps: {
      submittedAt: string(meta.submitTime),
      signedAt: string(meta.signedAt),
      deliveredAt: string(meta.deliveredAt),
      settledAt: string(meta.settledAt),
      refundedAt: string(meta.refundedAt),
      expiredAt: string(meta.expiredAt),
    },
    quote: {
      id: string(quote?.quoteId) ?? string(meta.quoteId),
      solver: string(meta.solverAddress),
      inputDecimals: string(quote?.fromAssetDecimals),
      outputDecimals: string(quote?.toAssetDecimals),
    },
  };
}

export async function getLifiAddressActivity(
  input: { address: string; limit: number; offset: number },
  env: NodeJS.ProcessEnv = process.env,
): Promise<JsonRecord> {
  if (!isAddress(input.address)) throw new ToolError("address must be a valid 0x-prefixed EVM address.", "INVALID_EVM_ADDRESS");
  const address = getAddress(input.address);
  // LI.FI Orders currently rejects limits above 50 with HTTP 400. Mayan can
  // still receive the caller's larger limit through the aggregate tool.
  const limit = Math.min(input.limit, 50);
  const endpoint = env.LIFI_ORDERS_URL ?? DEFAULT_LIFI_ORDERS_URL;
  let url: URL;
  try {
    url = new URL(endpoint);
    url.searchParams.set("user", address);
    url.searchParams.set("limit", String(limit));
    url.searchParams.set("offset", String(input.offset));
  } catch { throw new ToolError("LIFI_ORDERS_URL must be a valid absolute URL.", "INVALID_RPC_URL"); }

  try {
    const response = await fetch(url, { headers: { accept: "application/json" } });
    if (!response.ok) throw new ToolError(`LI.FI Orders request failed with HTTP ${response.status} ${response.statusText}.`, "BRIDGE_PROVIDER_ERROR");
    const payload = await response.json() as JsonRecord;
    const meta = record(payload.meta) ?? {};
    const activities = list(payload.data).map(activity).filter((value): value is JsonRecord => value !== null);
    return {
      provider: "lifi-orders",
      address,
      activityCount: activities.length,
      pagination: { limit: string(meta.limit ?? limit), offset: string(meta.offset ?? input.offset), total: string(meta.total) },
      activities,
      raw: jsonSafe(payload),
    };
  } catch (error) {
    if (error instanceof ToolError) throw error;
    throw new ToolError(`LI.FI Orders request failed: ${error instanceof Error ? error.message : String(error)}`, "BRIDGE_PROVIDER_ERROR");
  }
}
