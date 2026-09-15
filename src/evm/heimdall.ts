import { execFile } from "node:child_process";
import { existsSync } from "node:fs";
import { promisify } from "node:util";
import { getAddress, isAddress } from "viem";
import { ToolError } from "../shared/errors.js";
import type { JsonRecord } from "../types.js";
import { alchemyRpcUrl, isAlchemyEvmChain } from "./config.js";

const execFileAsync = promisify(execFile);
const DEFAULT_HEIMDALL_PATH = "/home/user/.bifrost/bin/heimdall";

export type HeimdallFormat = "solidity" | "yul";
export type HeimdallRunner = (binary: string, args: string[], timeoutMs: number) => Promise<{ stdout: string; stderr: string }>;

function parseOutput(stdout: string, stderr: string, input: { address: string; chain: string; format: HeimdallFormat }): JsonRecord {
  const abiMarker = stdout.indexOf("ABI:");
  const sourceMarker = stdout.indexOf("Source:");
  const abiText = abiMarker >= 0 ? stdout.slice(abiMarker + "ABI:".length, sourceMarker >= 0 ? sourceMarker : undefined).trim() : "";
  const source = sourceMarker >= 0 ? stdout.slice(sourceMarker + "Source:".length).trim() : stdout.trim();
  let abi: unknown = null;
  try { abi = abiText ? JSON.parse(abiText) : null; } catch { /* Keep raw output when Heimdall emits non-JSON ABI text. */ }
  const diagnostics = [abiMarker > 0 ? stdout.slice(0, abiMarker).trim() : "", stderr.trim()].filter(Boolean).join("\n") || null;
  return {
    provider: "heimdall",
    address: getAddress(input.address),
    chain: input.chain,
    format: input.format,
    abi,
    source,
    diagnostics,
    raw: { stdout, stderr },
  };
}

function heimdallPath(env: NodeJS.ProcessEnv): string {
  if (env.HEIMDALL_PATH) return env.HEIMDALL_PATH;
  return existsSync(DEFAULT_HEIMDALL_PATH) ? DEFAULT_HEIMDALL_PATH : "heimdall";
}

export async function getEvmDecompiledContract(
  input: { address: string; chain: string; format?: HeimdallFormat; timeoutMs?: number },
  env: NodeJS.ProcessEnv = process.env,
  runner: HeimdallRunner = async (binary, args, timeoutMs) => {
    const result = await execFileAsync(binary, args, { timeout: timeoutMs, maxBuffer: 20 * 1024 * 1024 });
    return { stdout: result.stdout, stderr: result.stderr };
  },
): Promise<JsonRecord> {
  if (!isAddress(input.address)) throw new ToolError("address must be a valid 0x-prefixed EVM address.", "INVALID_EVM_ADDRESS");
  if (!isAlchemyEvmChain(input.chain)) throw new ToolError(`Unsupported EVM chain '${input.chain}'. Use evm_list_chains to see supported slugs.`, "INVALID_EVM_CHAIN");
  const rpcUrl = env.HEIMDALL_RPC_URL ?? (env.ALCHEMY_API_KEY ? alchemyRpcUrl(input.chain, env.ALCHEMY_API_KEY) : null);
  if (!rpcUrl) throw new ToolError("No Heimdall RPC configured. Set HEIMDALL_RPC_URL or ALCHEMY_API_KEY.", "RPC_NOT_CONFIGURED");
  const format = input.format ?? "solidity";
  const timeoutMs = input.timeoutMs ?? 30000;
  const args = ["decompile", getAddress(input.address), "--rpc-url", rpcUrl, "--default", format === "solidity" ? "--include-sol" : "--include-yul", "--output", "print", "--color", "never", "--timeout", String(timeoutMs)];
  try {
    const result = await runner(heimdallPath(env), args, timeoutMs + 5000);
    return parseOutput(result.stdout, result.stderr, { address: input.address, chain: input.chain, format });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new ToolError(`Heimdall decompilation failed: ${message}`, "DECOMPILATION_ERROR");
  }
}
