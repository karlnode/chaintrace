import { ToolError } from "../shared/errors.js";
import { jsonSafe } from "../shared/json.js";
import type { JsonRecord } from "../types.js";

/**
 * Networks for which Chainstack publishes a trace_transaction reference cURL.
 * The aliases deliberately match common RPC-provider labels, so a caller does
 * not need to learn a second naming convention just for tracing.
 */
const TRACE_NETWORKS: Record<string, { endpointNetwork: string; endpoint: string }> = {
  // These endpoints are the literal URLs in the current Chainstack
  // trace_transaction reference cURLs. They are intentionally not derived.
  "ethereum-mainnet": { endpointNetwork: "ethereum-mainnet", endpoint: "https://nd-422-757-666.p2pify.com/0a9d79d93fb2f4a4b1e04695da2b77a7" },
  "eth-mainnet": { endpointNetwork: "ethereum-mainnet", endpoint: "https://nd-422-757-666.p2pify.com/0a9d79d93fb2f4a4b1e04695da2b77a7" },
  "bnb-mainnet": { endpointNetwork: "bsc-mainnet", endpoint: "https://bsc-mainnet.core.chainstack.com/35848e183f3e3303c8cfeacbea831cab" },
  "bsc-mainnet": { endpointNetwork: "bsc-mainnet", endpoint: "https://bsc-mainnet.core.chainstack.com/35848e183f3e3303c8cfeacbea831cab" },
  bsc: { endpointNetwork: "bsc-mainnet", endpoint: "https://bsc-mainnet.core.chainstack.com/35848e183f3e3303c8cfeacbea831cab" },
  "polygon-mainnet": { endpointNetwork: "polygon-mainnet", endpoint: "https://nd-828-700-214.p2pify.com/a9bca2f0f84b54086ceebe590316fff3" },
  "matic-mainnet": { endpointNetwork: "polygon-mainnet", endpoint: "https://nd-828-700-214.p2pify.com/a9bca2f0f84b54086ceebe590316fff3" },
  "base-mainnet": { endpointNetwork: "base-mainnet", endpoint: "https://base-mainnet.core.chainstack.com/2fc1de7f08c0465f6a28e3c355e0cb14" },
};

type TraceNetwork = (typeof TRACE_NETWORKS)[string];

export function chainstackTraceChains(): Array<{ input: string; endpointNetwork: string; method: string }> {
  return Object.entries(TRACE_NETWORKS).map(([input, network]) => ({ input, endpointNetwork: network.endpointNetwork, method: "trace_transaction" }));
}

interface JsonRpcError {
  code?: number;
  message?: string;
  data?: unknown;
}

class ChainstackRpcError extends Error {
  constructor(readonly rpcError: JsonRpcError) {
    super(rpcError.message ?? "Chainstack returned an unknown JSON-RPC error.");
    this.name = "ChainstackRpcError";
  }
}

function networkFor(chain: string): TraceNetwork {
  const network = TRACE_NETWORKS[chain];
  if (!network) {
    throw new ToolError(`Chainstack trace RPC is not available for '${chain}'. Use a Chainstack network with Debug and Trace support.`, "TRACE_NOT_AVAILABLE");
  }
  return network;
}

function endpointEnvName(endpointNetwork: string): string {
  return `CHAINSTACK_${endpointNetwork.toUpperCase().replace(/[^A-Z0-9]/g, "_")}_RPC_URL`;
}

export interface ChainstackTraceClient {
  trace(chain: string, hash: string): Promise<{ endpointNetwork: string; method: string; result: unknown }>;
}

export function createChainstackTraceClient(env: NodeJS.ProcessEnv = process.env): ChainstackTraceClient {
  return {
    async trace(chain, hash) {
      const network = networkFor(chain);
      const endpoint = env[endpointEnvName(network.endpointNetwork)] ?? env.CHAINSTACK_RPC_URL ?? network.endpoint;
      try { new URL(endpoint); } catch { throw new ToolError("Configured Chainstack RPC URL must be a valid absolute URL.", "INVALID_RPC_URL"); }

      try {
        const response = await fetch(endpoint, {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "trace_transaction", params: [hash] }),
        });
        if (!response.ok) throw new Error(`HTTP ${response.status} ${response.statusText}`);
        const payload = await response.json() as { result?: unknown; error?: JsonRpcError };
        if (payload.error) throw new ChainstackRpcError(payload.error);
        return { endpointNetwork: network.endpointNetwork, method: "trace_transaction", result: payload.result };
      } catch (error) {
        throw new ToolError(`Chainstack trace_transaction failed for '${chain}': ${error instanceof Error ? error.message : String(error)}`, "RPC_ERROR");
      }
    },
  };
}

function asRecord(value: unknown): JsonRecord | null {
  return value !== null && typeof value === "object" && !Array.isArray(value) ? value as JsonRecord : null;
}

function decimalQuantity(value: unknown): string | null {
  if (typeof value !== "string") return null;
  try { return value.startsWith("0x") ? BigInt(value).toString() : BigInt(value).toString(); } catch { return null; }
}

function callFromFrame(frame: JsonRecord, depth: number): JsonRecord[] {
  const call: JsonRecord = {
    depth,
    type: frame.type ?? "CALL",
    from: frame.from ?? null,
    to: frame.to ?? null,
    valueWei: decimalQuantity(frame.value),
    input: frame.input ?? null,
    output: frame.output ?? null,
    gas: decimalQuantity(frame.gas),
    gasUsed: decimalQuantity(frame.gasUsed),
    error: frame.error ?? null,
    revertReason: frame.revertReason ?? null,
  };
  const children = Array.isArray(frame.calls) ? frame.calls.flatMap((child) => {
    const record = asRecord(child);
    return record ? callFromFrame(record, depth + 1) : [];
  }) : [];
  return [call, ...children];
}

/** Converts either callTracer's call tree or trace/arbtrace flat entries to a stable analyst-friendly list. */
export function summarizeTrace(trace: unknown): JsonRecord[] {
  if (Array.isArray(trace)) {
    return trace.flatMap((entry) => {
      const record = asRecord(entry);
      if (!record) return [];
      const action = asRecord(record.action) ?? {};
      const result = asRecord(record.result);
      return [{
        depth: Array.isArray(record.traceAddress) ? record.traceAddress.length : null,
        type: record.type ?? null,
        callType: action.callType ?? null,
        from: action.from ?? null,
        to: action.to ?? result?.address ?? null,
        valueWei: decimalQuantity(action.value),
        input: action.input ?? action.init ?? null,
        output: result?.output ?? result?.code ?? null,
        gas: decimalQuantity(action.gas),
        gasUsed: decimalQuantity(result?.gasUsed),
        error: record.error ?? null,
        traceAddress: record.traceAddress ?? null,
      }];
    });
  }
  const record = asRecord(trace);
  return record ? callFromFrame(record, 0) : [];
}

export function traceResult(trace: { endpointNetwork: string; method: string; result: unknown }): JsonRecord {
  const internalCalls = summarizeTrace(trace.result);
  return {
    provider: "chainstack",
    endpointNetwork: trace.endpointNetwork,
    method: trace.method,
    internalCallCount: internalCalls.length,
    internalCalls,
    raw: { trace: jsonSafe(trace.result) },
  };
}
