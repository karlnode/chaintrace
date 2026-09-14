import { decodeEventLog, decodeFunctionData, decodeFunctionResult, encodeFunctionData, getAddress, isAddress, toHex, type Abi, type Address, type Hex } from "viem";
import { ToolError } from "../shared/errors.js";
import { jsonSafe } from "../shared/json.js";
import type { JsonRecord } from "../types.js";
import { alchemyChainAliases, type EvmClients } from "./config.js";
import { chainstackTraceChains, traceResult, type ChainstackTraceClient } from "./chainstack.js";
import { getSourcifyContract } from "./sourcify.js";

const ERC20_ABI = [
  { type: "function", name: "name", stateMutability: "view", inputs: [], outputs: [{ type: "string" }] },
  { type: "function", name: "symbol", stateMutability: "view", inputs: [], outputs: [{ type: "string" }] },
  { type: "function", name: "decimals", stateMutability: "view", inputs: [], outputs: [{ type: "uint8" }] },
  { type: "function", name: "totalSupply", stateMutability: "view", inputs: [], outputs: [{ type: "uint256" }] },
] as const;

const EIP1967_IMPLEMENTATION_SLOT = "0x360894a13ba1a3210667c828492db98dca3e2076cc3735a920a3ca505d382bbc" as Hex;

function address(value: string, label: string): Address {
  if (!isAddress(value)) throw new ToolError(`${label} must be a valid 0x-prefixed EVM address.`, "INVALID_EVM_ADDRESS");
  return getAddress(value);
}

function transactionHash(value: string): Hex {
  if (!/^0x[0-9a-fA-F]{64}$/.test(value)) throw new ToolError("hash must be a valid 32-byte EVM transaction hash.", "INVALID_EVM_TRANSACTION_HASH");
  return value as Hex;
}

async function request<T>(client: unknown, method: string, params: unknown[] = []): Promise<T> {
  return (client as any).request({ method, params }) as Promise<T>;
}

async function context(clients: EvmClients, chain: string) {
  const client = clients.get(chain);
  const rawChainId = await request<Hex>(client, "eth_chainId");
  return { client, chainId: BigInt(rawChainId).toString(), rawChainId };
}

function asEvmError(error: unknown): ToolError {
  if (error instanceof ToolError) return error;
  return new ToolError(`EVM RPC request failed: ${error instanceof Error ? error.message : String(error)}`, "RPC_ERROR");
}

/** MCP-native discovery for provider labels and Chainstack trace capability. */
export function getEvmChains(): JsonRecord {
  return {
    alchemy: {
      chainInput: "Use Alchemy's network slug (for example bnb-mainnet). Other valid Alchemy slugs are passed through without a hard-coded registry and verified with eth_chainId.",
      aliases: alchemyChainAliases(),
    },
    chainstackTrace: {
      chainInput: "Use one of these labels with evm_trace_transaction. It selects the appropriate Chainstack endpoint and trace method.",
      supported: chainstackTraceChains(),
    },
  };
}

export async function getEvmAddress(clients: EvmClients, input: { address: string; chain: string }): Promise<JsonRecord> {
  const account = address(input.address, "address");
  try {
    const { client, chainId, rawChainId } = await context(clients, input.chain);
    const [balance, nonce, code] = await Promise.all([
      request<Hex>(client, "eth_getBalance", [account, "latest"]),
      request<Hex>(client, "eth_getTransactionCount", [account, "latest"]),
      request<Hex>(client, "eth_getCode", [account, "latest"]),
    ]);
    return {
      chain: input.chain, chainId, address: account,
      account: { type: code === "0x" ? "eoa" : "contract", balanceWei: BigInt(balance).toString(), nonce: BigInt(nonce).toString(), codeSizeBytes: (code.length - 2) / 2 },
      raw: { chainId: rawChainId, balance, nonce, code },
    };
  } catch (error) { throw asEvmError(error); }
}

export async function getEvmTransaction(clients: EvmClients, input: { hash: string; chain: string }): Promise<JsonRecord> {
  const hash = transactionHash(input.hash);
  try {
    const { client, chainId, rawChainId } = await context(clients, input.chain);
    const [transaction, receipt] = await Promise.all([
      request<JsonRecord | null>(client, "eth_getTransactionByHash", [hash]),
      request<JsonRecord | null>(client, "eth_getTransactionReceipt", [hash]),
    ]);
    if (!transaction) throw new ToolError(`Transaction ${hash} was not found on ${input.chain}.`, "TRANSACTION_NOT_FOUND");
    const decoded = await decodeEvmTransaction(client, chainId, transaction, receipt);
    return { chain: input.chain, chainId, hash, transaction: jsonSafe(transaction), receipt: jsonSafe(receipt), decoded, raw: { chainId: rawChainId, transaction, receipt } };
  } catch (error) { throw asEvmError(error); }
}

/** Get Chainstack's execution trace separately, so ordinary transaction reads stay fast and provider-agnostic. */
export async function getEvmTraceTransaction(client: ChainstackTraceClient, input: { hash: string; chain: string }): Promise<JsonRecord> {
  const hash = transactionHash(input.hash);
  try {
    return { chain: input.chain, hash, ...traceResult(await client.trace(input.chain, hash)) };
  } catch (error) { throw asEvmError(error); }
}

type TransferDirection = "from" | "to" | "both";

async function transfersForDirection(client: unknown, account: Address, direction: "from" | "to", maxCount: number, pageKey?: string) {
  return request<JsonRecord>(client, "alchemy_getAssetTransfers", [{
    [direction === "from" ? "fromAddress" : "toAddress"]: account,
    category: ["external", "erc20", "erc721", "erc1155", "specialnft"],
    withMetadata: true,
    excludeZeroValue: false,
    maxCount: toHex(maxCount),
    order: "desc",
    ...(pageKey ? { pageKey } : {}),
  }]);
}

export async function getEvmAddressTransactions(clients: EvmClients, input: { address: string; chain: string; maxCount: number; pageKey?: string; direction?: TransferDirection }): Promise<JsonRecord> {
  const account = address(input.address, "address");
  const direction = input.direction ?? "both";
  if (direction === "both" && input.pageKey) throw new ToolError("pageKey requires direction 'from' or 'to'; a two-direction query returns independent nextPageKeys.", "INVALID_PAGINATION");
  try {
    const { client, chainId, rawChainId } = await context(clients, input.chain);
    const results = direction === "both"
      ? await Promise.all([transfersForDirection(client, account, "from", input.maxCount), transfersForDirection(client, account, "to", input.maxCount)])
      : [await transfersForDirection(client, account, direction, input.maxCount, input.pageKey)];
    const labelled = results.map((result, index) => ({ direction: direction === "both" ? (index === 0 ? "from" : "to") : direction, result }));
    const transfers = labelled.flatMap(({ direction, result }) => Array.isArray(result.transfers) ? result.transfers.map((transfer) => ({ direction, ...jsonSafe(transfer) as JsonRecord })) : []);
    return {
      chain: input.chain, chainId, address: account, direction, transferCount: transfers.length, transfers,
      nextPageKeys: Object.fromEntries(labelled.map(({ direction, result }) => [direction, result.pageKey ?? null])),
      raw: { chainId: rawChainId, results: jsonSafe(labelled) },
    };
  } catch (error) { throw asEvmError(error); }
}

async function erc20Call(client: unknown, account: Address, functionName: "name" | "symbol" | "decimals" | "totalSupply") {
  const data = encodeFunctionData({ abi: ERC20_ABI, functionName });
  try {
    const raw = await request<Hex>(client, "eth_call", [{ to: account, data }, "latest"]);
    return { value: decodeFunctionResult({ abi: ERC20_ABI, functionName, data: raw }), raw, error: null };
  } catch (error) {
    return { value: null, raw: null, error: error instanceof Error ? error.message : String(error) };
  }
}

export async function getEvmToken(clients: EvmClients, input: { address: string; chain: string }): Promise<JsonRecord> {
  const token = address(input.address, "address");
  try {
    const { client, chainId, rawChainId } = await context(clients, input.chain);
    const [code, name, symbol, decimals, totalSupply] = await Promise.all([
      request<Hex>(client, "eth_getCode", [token, "latest"]),
      erc20Call(client, token, "name"), erc20Call(client, token, "symbol"), erc20Call(client, token, "decimals"), erc20Call(client, token, "totalSupply"),
    ]);
    if (code === "0x") throw new ToolError(`${token} has no deployed code and is not a token contract.`, "NOT_A_CONTRACT");
    return {
      chain: input.chain, chainId, address: token,
      token: { name: name.value, symbol: symbol.value, decimals: decimals.value === null ? null : String(decimals.value), totalSupply: totalSupply.value === null ? null : String(totalSupply.value) },
      callErrors: {
        ...(name.error ? { name: name.error } : {}),
        ...(symbol.error ? { symbol: symbol.error } : {}),
        ...(decimals.error ? { decimals: decimals.error } : {}),
        ...(totalSupply.error ? { totalSupply: totalSupply.error } : {}),
      },
      raw: { chainId: rawChainId, code, calls: { name: name.raw, symbol: symbol.raw, decimals: decimals.raw, totalSupply: totalSupply.raw } },
    };
  } catch (error) { throw asEvmError(error); }
}

function storageAddress(value: Hex): Address | null {
  const candidate = `0x${value.slice(-40)}`;
  return /^0x0{40}$/i.test(candidate) ? null : getAddress(candidate);
}

async function resolveSourcifyContract(client: unknown, chainId: string, contract: Address) {
  let implementation: Address | null = null;
  try {
    implementation = storageAddress(await request<Hex>(client, "eth_getStorageAt", [contract, EIP1967_IMPLEMENTATION_SLOT, "latest"]));
  } catch { /* Verification lookup remains useful even if a node does not expose storage. */ }
  const primary = await getSourcifyContract(chainId, implementation ?? contract);
  const fallback = implementation && !primary.abi ? await getSourcifyContract(chainId, contract) : null;
  const verified = primary.abi ? primary : fallback ?? primary;
  return { implementation, verified };
}

function asHex(value: unknown): Hex | null {
  return typeof value === "string" && /^0x[0-9a-fA-F]*$/.test(value) ? value as Hex : null;
}

function record(value: unknown): JsonRecord | null {
  return value !== null && typeof value === "object" && !Array.isArray(value) ? value as JsonRecord : null;
}

function decodeWithAbi(abi: Abi, transaction: JsonRecord, receipt: JsonRecord | null, contract: Address, implementation: Address | null): JsonRecord {
  const calldata = asHex(transaction.input ?? transaction.data);
  let functionCall: JsonRecord | null = null;
  let functionError: string | null = null;
  if (calldata && calldata !== "0x") {
    try {
      const decoded = decodeFunctionData({ abi, data: calldata });
      functionCall = { name: decoded.functionName, args: jsonSafe(decoded.args) };
    } catch (error) { functionError = error instanceof Error ? error.message : String(error); }
  }
  const rawLogs = receipt && Array.isArray(receipt.logs) ? receipt.logs : [];
  const events: JsonRecord[] = [];
  for (const value of rawLogs) {
    const log = record(value);
    const data = log && asHex(log.data);
    const topics = log && Array.isArray(log.topics) && log.topics.length > 0 && log.topics.every((topic) => asHex(topic)) ? log.topics as [Hex, ...Hex[]] : null;
    if (!log || !data || !topics) continue;
    try {
      const decoded = decodeEventLog({ abi, data, topics, strict: false });
      events.push({ address: log.address, name: decoded.eventName, args: jsonSafe(decoded.args), logIndex: log.logIndex ?? null });
    } catch { /* Logs from unrelated contracts are expected. */ }
  }
  return {
    available: true, confidence: "verified", abiSource: "sourcify", contractAddress: contract,
    proxyImplementation: implementation, function: functionCall, functionError, events,
  };
}

async function decodeEvmTransaction(client: unknown, chainId: string, transaction: JsonRecord, receipt: JsonRecord | null): Promise<JsonRecord> {
  const target = asHex(transaction.to) && typeof transaction.to === "string" && isAddress(transaction.to) ? getAddress(transaction.to) : null;
  if (!target) return { available: false, reason: "Transaction creates a contract or has no destination address." };
  const { implementation, verified } = await resolveSourcifyContract(client, chainId, target);
  if (!verified.abi) {
    return { available: false, reason: verified.error ?? "No verified Sourcify ABI found for the destination contract.", contractAddress: target, proxyImplementation: implementation };
  }
  return decodeWithAbi(verified.abi, transaction, receipt, implementation ?? target, implementation);
}

export async function getEvmContract(clients: EvmClients, input: { address: string; chain: string }): Promise<JsonRecord> {
  const contract = address(input.address, "address");
  try {
    const { client, chainId, rawChainId } = await context(clients, input.chain);
    const [code, implementationSlot] = await Promise.all([
      request<Hex>(client, "eth_getCode", [contract, "latest"]),
      request<Hex>(client, "eth_getStorageAt", [contract, EIP1967_IMPLEMENTATION_SLOT, "latest"]),
    ]);
    if (code === "0x") throw new ToolError(`${contract} has no deployed code and is not a contract.`, "NOT_A_CONTRACT");
    const implementation = storageAddress(implementationSlot);
    const verified = await getSourcifyContract(chainId, implementation ?? contract);
    return {
      chain: input.chain, chainId, address: contract,
      contract: { codeSizeBytes: (code.length - 2) / 2, proxy: implementation ? { standard: "eip-1967", implementation } : null },
      sourcify: { verified: verified.found, abiAvailable: verified.abi !== null, metadataAvailable: verified.metadata !== null, sourcesAvailable: verified.sources !== null, error: verified.error },
      raw: { chainId: rawChainId, code, eip1967ImplementationSlot: implementationSlot },
    };
  } catch (error) { throw asEvmError(error); }
}

export async function getEvmContractInfo(clients: EvmClients, input: { address: string; chain: string }): Promise<JsonRecord> {
  const contract = address(input.address, "address");
  try {
    const { client, chainId, rawChainId } = await context(clients, input.chain);
    const { implementation, verified } = await resolveSourcifyContract(client, chainId, contract);
    return {
      chain: input.chain, chainId, address: contract, lookupAddress: implementation ?? contract,
      proxyImplementation: implementation,
      sourcify: { verified: verified.found, abi: verified.abi, metadata: verified.metadata, sources: verified.sources, error: verified.error },
      raw: { chainId: rawChainId, sourcify: verified.raw },
    };
  } catch (error) { throw asEvmError(error); }
}
