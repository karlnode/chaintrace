import { afterEach, describe, expect, it, vi } from "vitest";
import type { EvmClients } from "../src/evm/config.js";
import type { ChainstackTraceClient } from "../src/evm/chainstack.js";
import { getEvmAddress, getEvmAddressTransactions, getEvmContractInfo, getEvmToken, getEvmTraceTransaction, getEvmTransaction, getEvmVerifiedContract } from "../src/evm/tools.js";
import { getEvmDecompiledContract } from "../src/evm/heimdall.js";

const address = "0x000000000000000000000000000000000000dEaD";
const hash = `0x${"a".repeat(64)}`;

function clients(handler: (method: string, params: unknown[]) => unknown): EvmClients {
  return { get: () => ({ request: async ({ method, params }: any) => handler(method, params) }) as any };
}

describe("EVM tool handlers", () => {
  afterEach(() => vi.unstubAllGlobals());
  it("gets address details and resolves the chain ID from RPC", async () => {
    const result = await getEvmAddress(clients((method) => ({ eth_chainId: "0x2a", eth_getBalance: "0xde0b6b3a7640000", eth_getTransactionCount: "0x3", eth_getCode: "0x6000" } as Record<string, unknown>)[method]), { address, chain: "shape-mainnet" });
    expect(result).toMatchObject({ chain: "shape-mainnet", chainId: "42", account: { type: "contract", balanceWei: "1000000000000000000", nonce: "3" } });
  });

  it("runs Heimdall and separates ABI, source, and diagnostics", async () => {
    let called: { binary: string; args: string[] } | undefined;
    const result = await getEvmDecompiledContract(
      { address, chain: "eth-mainnet", format: "solidity", timeoutMs: 5000 },
      { HEIMDALL_PATH: "/custom/heimdall", HEIMDALL_RPC_URL: "https://rpc.example" },
      async (binary, args) => {
        called = { binary, args };
        return { stdout: "warning\nABI:\n[{\"type\":\"function\",\"name\":\"ping\"}]\nSource:\ncontract Decompiled {}\n", stderr: "" };
      },
    );
    expect(called).toMatchObject({ binary: "/custom/heimdall", args: expect.arrayContaining(["--include-sol", "--rpc-url", "https://rpc.example"]) });
    expect(result).toMatchObject({ provider: "heimdall", abi: [{ name: "ping" }], source: "contract Decompiled {}", diagnostics: "warning" });
  });

  it("gets a transaction and receipt", async () => {
    const result = await getEvmTransaction(clients((method) => ({ eth_chainId: "0x1", eth_getTransactionByHash: { hash, from: address }, eth_getTransactionReceipt: { transactionHash: hash, status: "0x1" } } as Record<string, unknown>)[method]), { hash, chain: "robinhood-mainnet" });
    expect(result).toMatchObject({ chainId: "1", hash, receipt: { status: "0x1" } });
  });

  it("keeps Chainstack execution traces separate from ordinary transaction reads", async () => {
    const traceClient: ChainstackTraceClient = { trace: async () => ({ endpointNetwork: "base-mainnet", method: "trace_transaction", result: [{ type: "call", action: { from: address, to: address, value: "0x1" }, traceAddress: [] }] }) };
    const result = await getEvmTraceTransaction(traceClient, { hash, chain: "base-mainnet" });
    expect(result).toMatchObject({ provider: "chainstack", internalCallCount: 1, internalCalls: [{ valueWei: "1" }], raw: { trace: [{ type: "call" }] } });
  });

  it("uses Alchemy indexed transfers for address history", async () => {
    const result = await getEvmAddressTransactions(clients((method, params) => {
      if (method === "eth_chainId") return "0x1";
      const request = params[0] as Record<string, unknown>;
      return { transfers: [{ hash, from: request.fromAddress ?? address, to: request.toAddress ?? address }], pageKey: "next" };
    }), { address, chain: "robinhood-mainnet", maxCount: 10, direction: "from" });
    expect(result).toMatchObject({ direction: "from", transferCount: 1, transfers: [{ hash, direction: "from" }], nextPageKeys: { from: "next" } });
  });

  it("returns ERC-20 call failures as metadata errors rather than failing the entire token lookup", async () => {
    const result = await getEvmToken(clients((method) => {
      if (method === "eth_chainId") return "0x1";
      if (method === "eth_getCode") return "0x6000";
      throw new Error("not an ERC-20");
    }), { address, chain: "shape-mainnet" });
    expect(result).toMatchObject({ token: { name: null, symbol: null, decimals: null, totalSupply: null }, callErrors: { name: "not an ERC-20" } });
  });

  it("detects an EIP-1967 implementation address", async () => {
    const implementation = "000000000000000000000000000000000000beef";
    const result = await getEvmContractInfo(clients((method) => ({ eth_chainId: "0x1", eth_getCode: "0x6000", eth_getStorageAt: `0x000000000000000000000000${implementation}` } as Record<string, unknown>)[method]), { address, chain: "robinhood-mainnet" });
    expect(result).toMatchObject({ contract: { proxy: { standard: "eip-1967", implementation: "0x000000000000000000000000000000000000bEEF" } } });
  });

  it("decodes transaction calldata with a verified Sourcify ABI", async () => {
    vi.stubGlobal("fetch", async () => new Response(JSON.stringify({ abi: [{ type: "function", name: "transfer", inputs: [{ name: "to", type: "address" }, { name: "value", type: "uint256" }], outputs: [] }] }), { status: 200 }));
    const calldata = `0xa9059cbb${"0".repeat(24)}000000000000000000000000000000000000dEaD${"0".repeat(63)}1`;
    const result = await getEvmTransaction(clients((method) => ({
      eth_chainId: "0x1",
      eth_getStorageAt: `0x${"0".repeat(64)}`,
      eth_getTransactionByHash: { hash, to: address, input: calldata },
      eth_getTransactionReceipt: { transactionHash: hash, logs: [] },
    } as Record<string, unknown>)[method]), { hash, chain: "shape-mainnet" });
    expect(result).toMatchObject({ decoded: { available: true, confidence: "verified", abiSource: "sourcify", function: { name: "transfer" } } });
  });

  it("returns full Sourcify contract information", async () => {
    vi.stubGlobal("fetch", async () => new Response(JSON.stringify({ abi: [], metadata: { compiler: "solc" }, sources: { "Contract.sol": { content: "contract Contract {}" } } }), { status: 200 }));
    const result = await getEvmVerifiedContract(clients((method) => ({ eth_chainId: "0x1", eth_getStorageAt: `0x${"0".repeat(64)}` } as Record<string, unknown>)[method]), { address, chain: "shape-mainnet" });
    expect(result).toMatchObject({ lookupAddress: address, sourcify: { verified: true, abi: [], metadata: { compiler: "solc" } } });
  });

  it("falls back to Etherscan for ABI and wrapped source code", async () => {
    vi.stubEnv("ETHERSCAN_API_KEY", "test-key");
    const sourceCode = JSON.stringify({ language: "Solidity", sources: { "Contract.sol": { content: "contract Contract {}" } }, settings: {} });
    vi.stubGlobal("fetch", vi.fn()
      .mockResolvedValueOnce(new Response(JSON.stringify({ status: "1", message: "OK", result: [{ ABI: JSON.stringify([{ type: "function", name: "ping", inputs: [], outputs: [] }]), SourceCode: `{${sourceCode}}`, ContractName: "Contract", CompilerVersion: "v0.8.0" }] }), { status: 200 })));
    const result = await getEvmVerifiedContract(clients((method) => ({ eth_chainId: "0x38", eth_getStorageAt: `0x${"0".repeat(64)}` } as Record<string, unknown>)[method]), { address, chain: "bsc-mainnet" });
    expect(result).toMatchObject({ verification: { source: "etherscan" }, etherscan: { abi: [{ name: "ping" }], sources: { "Contract.sol": { content: "contract Contract {}" } }, metadata: { contractName: "Contract" } } });
    expect(String(vi.mocked(fetch).mock.calls[0]?.[0])).toContain("chainid=56");
  });
});
