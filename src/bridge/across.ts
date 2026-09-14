import { getAddress, isAddress } from "viem";
import { ToolError } from "../shared/errors.js";
import { jsonSafe } from "../shared/json.js";
import type { JsonRecord } from "../types.js";

const DEFAULT_ACROSS_TRANSFERS_URL = "https://across.to/_api/transfers";

function record(value: unknown): JsonRecord | null {
  return value !== null && typeof value === "object" && !Array.isArray(value) ? value as JsonRecord : null;
}
function list(value: unknown): unknown[] { return Array.isArray(value) ? value : []; }
function string(value: unknown): string | null { return value === undefined || value === null ? null : String(value); }

function activity(value: unknown): JsonRecord | null {
  const transfer = record(value);
  const origin = record(transfer?.origin);
  const destination = record(transfer?.destination);
  const deposit = record(transfer?.deposit);
  const fill = record(transfer?.fill);
  const originToken = record(origin?.token);
  const destinationToken = record(destination?.token);
  if (!transfer || !origin || !destination) return null;
  return {
    id: string(transfer.ref) ?? string(transfer.depositId),
    status: string(transfer.status),
    source: {
      chainId: string(origin.chainId),
      token: string(originToken?.address),
      amount: string(origin.amount),
      transactionHash: string(deposit?.txHash),
    },
    destination: {
      chainId: string(destination.chainId),
      token: string(destinationToken?.address),
      amount: string(destination.amount),
      recipient: string(destination.address),
      deliveryTransactionHash: string(fill?.txHash),
    },
    settlement: { refundTransactionHash: string(transfer.refundTxHash) },
    timestamps: { depositedAt: string(deposit?.timestamp), filledAt: string(fill?.timestamp) },
    route: { source: string(transfer.source), depositId: string(transfer.depositId) },
    fees: { bridgeFeeUsd: string(transfer.bridgeFeeUsd) },
  };
}

export async function getAcrossAddressActivity(
  input: { address: string; limit: number; offset: number },
  env: NodeJS.ProcessEnv = process.env,
): Promise<JsonRecord> {
  if (!isAddress(input.address)) throw new ToolError("address must be a valid 0x-prefixed EVM address.", "INVALID_EVM_ADDRESS");
  const address = getAddress(input.address);
  let url: URL;
  try {
    url = new URL(env.ACROSS_TRANSFERS_URL ?? DEFAULT_ACROSS_TRANSFERS_URL);
    url.searchParams.set("source", "v4");
    url.searchParams.set("address", address);
    url.searchParams.set("limit", String(input.limit));
    // Across uses cursors. Its public first-page endpoint has no offset; retain
    // offset only for the aggregate tool's common input and expose nextCursor.
  } catch { throw new ToolError("ACROSS_TRANSFERS_URL must be a valid absolute URL.", "INVALID_RPC_URL"); }
  try {
    const response = await fetch(url, { headers: { accept: "application/json" } });
    if (!response.ok) throw new ToolError(`Across transfers request failed with HTTP ${response.status} ${response.statusText}.`, "BRIDGE_PROVIDER_ERROR");
    const payload = await response.json() as JsonRecord;
    const activities = list(payload.transfers).map(activity).filter((value): value is JsonRecord => value !== null);
    return {
      provider: "across",
      address,
      activityCount: activities.length,
      pagination: { limit: String(input.limit), offsetIgnored: input.offset > 0, nextCursor: string(payload.nextCursor) },
      activities,
      raw: jsonSafe(payload),
    };
  } catch (error) {
    if (error instanceof ToolError) throw error;
    throw new ToolError(`Across transfers request failed: ${error instanceof Error ? error.message : String(error)}`, "BRIDGE_PROVIDER_ERROR");
  }
}
