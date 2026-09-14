import type { Abi, Address } from "viem";

const DEFAULT_ETHERSCAN_API_URL = "https://api.etherscan.io/v2/api";

export interface EtherscanContract {
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

function parseAbi(value: unknown): Abi | null {
  if (Array.isArray(value)) return value as Abi;
  if (typeof value !== "string" || !value.trim() || value.includes("not verified")) return null;
  try {
    const parsed: unknown = JSON.parse(value);
    return Array.isArray(parsed) ? parsed as Abi : null;
  } catch { return null; }
}

function parseSources(value: unknown): unknown | null {
  if (typeof value !== "string" || !value.trim()) return null;
  const source = value.trim();
  if (source.startsWith("{{") && source.endsWith("}}")) {
    try {
      const parsed: unknown = JSON.parse(source.slice(1, -1));
      const parsedRecord = record(parsed);
      return parsedRecord?.sources ?? parsed;
    } catch { /* Fall through and preserve the source as a single file. */ }
  }
  return { "Contract.sol": { content: value } };
}

/** Fetch verified ABI and source information from Etherscan's multichain API. */
export async function getEtherscanContract(chainId: string, address: Address, env = process.env): Promise<EtherscanContract> {
  const apiKey = env.ETHERSCAN_API_KEY;
  if (!apiKey) return { found: false, abi: null, metadata: null, sources: null, raw: null, error: "ETHERSCAN_API_KEY is not configured." };
  const baseUrl = (env.ETHERSCAN_API_URL ?? DEFAULT_ETHERSCAN_API_URL).replace(/\/$/, "");
  const url = new URL(baseUrl);
  url.searchParams.set("module", "contract");
  url.searchParams.set("action", "getsourcecode");
  url.searchParams.set("apikey", apiKey);
  url.searchParams.set("chainid", chainId);
  url.searchParams.set("address", address);
  try {
    const response = await fetch(url, { headers: { accept: "application/json" } });
    if (!response.ok) return { found: false, abi: null, metadata: null, sources: null, raw: null, error: `Etherscan lookup returned HTTP ${response.status}.` };
    const raw: unknown = await response.json();
    const root = record(raw);
    const result = root && Array.isArray(root.result) ? record(root.result[0]) : null;
    const abi = parseAbi(result?.ABI);
    const sources = parseSources(result?.SourceCode);
    const status = root?.status;
    if (!result || status === "0" || (!abi && !sources)) {
      return { found: false, abi: null, metadata: null, sources: null, raw, error: typeof root?.message === "string" ? `Etherscan: ${root.message}` : "No verified Etherscan contract data found." };
    }
    const { ABI: _abi, SourceCode: _sourceCode, ...details } = result;
    return {
      found: true,
      abi,
      sources,
      metadata: { ...details, contractName: result.ContractName ?? null, compilerVersion: result.CompilerVersion ?? null, compilerType: result.CompilerType ?? null, optimizationUsed: result.OptimizationUsed ?? null, runs: result.Runs ?? null, evmVersion: result.EVMVersion ?? null, licenseType: result.LicenseType ?? null, proxy: result.Proxy ?? null, implementation: result.Implementation ?? null },
      raw,
      error: null,
    };
  } catch (error) {
    return { found: false, abi: null, metadata: null, sources: null, raw: null, error: `Etherscan lookup failed: ${error instanceof Error ? error.message : String(error)}` };
  }
}
