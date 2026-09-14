import { getAddress, isAddress } from "viem";
import { ToolError } from "../shared/errors.js";
import { jsonSafe } from "../shared/json.js";
import type { JsonRecord } from "../types.js";

const DEFAULT_MAYAN_EXPLORER_API_URL = "https://explorer-api.mayan.finance/v3/swaps/trader";

function record(value: unknown): JsonRecord | null {
  return value !== null && typeof value === "object" && !Array.isArray(value) ? value as JsonRecord : null;
}

function list(value: unknown): unknown[] { return Array.isArray(value) ? value : []; }
function string(value: unknown): string | null { return value === undefined || value === null ? null : String(value); }

function activity(value: unknown): JsonRecord | null {
  const swap = record(value);
  if (!swap) return null;
  return {
    id: string(swap.orderId) ?? string(swap.orderHash),
    status: string(swap.clientStatus) ?? string(swap.status),
    providerStatus: string(swap.status),
    source: {
      chainId: string(swap.sourceChain),
      token: string(swap.fromTokenAddress),
      symbol: string(swap.fromTokenSymbol),
      amount: string(swap.fromAmount),
      transactionHash: string(swap.sourceTxHash),
    },
    destination: {
      chainId: string(swap.destChain),
      token: string(swap.toTokenAddress),
      symbol: string(swap.toTokenSymbol),
      amount: string(swap.toAmount),
      recipient: string(swap.destAddress),
      deliveryTransactionHash: null,
    },
    route: {
      swapChainId: string(swap.swapChain),
      service: string(swap.service),
      orderHash: string(swap.orderHash),
      cctpNonce: string(swap.cctpNonce),
    },
    timestamps: { initiatedAt: string(swap.initiatedAt), updatedAt: string(swap.statusUpdatedAt) },
  };
}

export async function getMayanAddressActivity(
  input: { address: string; limit: number; offset: number },
  env: NodeJS.ProcessEnv = process.env,
): Promise<JsonRecord> {
  if (!isAddress(input.address)) throw new ToolError("address must be a valid 0x-prefixed EVM address.", "INVALID_EVM_ADDRESS");
  const address = getAddress(input.address);
  let url: URL;
  try {
    url = new URL(env.MAYAN_EXPLORER_API_URL ?? DEFAULT_MAYAN_EXPLORER_API_URL);
    url.searchParams.set("trader", address);
    url.searchParams.set("limit", String(input.limit));
    url.searchParams.set("offset", String(input.offset));
  } catch { throw new ToolError("MAYAN_EXPLORER_API_URL must be a valid absolute URL.", "INVALID_RPC_URL"); }
  try {
    const response = await fetch(url, { headers: { accept: "application/json" } });
    if (!response.ok) throw new ToolError(`Mayan Explorer request failed with HTTP ${response.status} ${response.statusText}.`, "BRIDGE_PROVIDER_ERROR");
    const payload = await response.json() as JsonRecord;
    const metadata = record(payload.metadata) ?? {};
    const activities = list(payload.data).map(activity).filter((value): value is JsonRecord => value !== null);
    return {
      provider: "mayan",
      address,
      activityCount: activities.length,
      pagination: { limit: String(input.limit), offset: String(input.offset), total: string(metadata.count) },
      volume: string(metadata.volume),
      activities,
      raw: jsonSafe(payload),
    };
  } catch (error) {
    if (error instanceof ToolError) throw error;
    throw new ToolError(`Mayan Explorer request failed: ${error instanceof Error ? error.message : String(error)}`, "BRIDGE_PROVIDER_ERROR");
  }
}
