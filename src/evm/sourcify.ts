import type { Abi, Address } from "viem";

const DEFAULT_SOURCIFY_SERVER_URL = "https://sourcify.dev/server";

export interface SourcifyContract {
  found: boolean;
  abi: Abi | null;
  metadata: unknown | null;
  sources: unknown | null;
  raw: unknown | null;
  error: string | null;
}

function record(value: unknown): Record<string, unknown> | null {
  return value !== null && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : null;
}

function firstValue(value: unknown, paths: string[][]): unknown | null {
  const root = record(value);
  if (!root) return null;
  for (const path of paths) {
    let current: unknown = root;
    for (const key of path) {
      const currentRecord = record(current);
      if (!currentRecord || !(key in currentRecord)) { current = null; break; }
      current = currentRecord[key];
    }
    if (current !== null && current !== undefined) return current;
  }
  return null;
}

function asAbi(value: unknown): Abi | null {
  return Array.isArray(value) ? value as Abi : null;
}

/** Fetch verified ABI, metadata, and sources from Sourcify's v2 contract lookup. */
export async function getSourcifyContract(chainId: string, address: Address, env = process.env): Promise<SourcifyContract> {
  const baseUrl = (env.SOURCIFY_SERVER_URL ?? DEFAULT_SOURCIFY_SERVER_URL).replace(/\/$/, "");
  try {
    const response = await fetch(`${baseUrl}/v2/contract/${chainId}/${address}?fields=all`, { headers: { accept: "application/json" } });
    if (response.status === 404) return { found: false, abi: null, metadata: null, sources: null, raw: null, error: null };
    if (!response.ok) return { found: false, abi: null, metadata: null, sources: null, raw: null, error: `Sourcify lookup returned HTTP ${response.status}.` };
    const raw: unknown = await response.json();
    return {
      found: true,
      abi: asAbi(firstValue(raw, [["abi"], ["contract", "abi"], ["compiledContract", "abi"]])),
      metadata: firstValue(raw, [["metadata"], ["contract", "metadata"], ["compiledContract", "metadata"]]),
      sources: firstValue(raw, [["sources"], ["contract", "sources"], ["compiledContract", "sources"]]),
      raw,
      error: null,
    };
  } catch (error) {
    return { found: false, abi: null, metadata: null, sources: null, raw: null, error: `Sourcify lookup failed: ${error instanceof Error ? error.message : String(error)}` };
  }
}
