import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { createEvmClients, type EvmClients } from "./evm/config.js";
import { getBridgeAddressActivity } from "./bridge/tools.js";
import { createChainstackTraceClient, type ChainstackTraceClient } from "./evm/chainstack.js";
import { getEvmAddress, getEvmAddressTransactions, getEvmChains, getEvmContract, getEvmContractInfo, getEvmToken, getEvmTraceTransaction, getEvmTransaction } from "./evm/tools.js";
import { ToolError } from "./shared/errors.js";
import type { SolanaConnections } from "./solana/config.js";
import { getAddress, getAddressSignatures, getProgramAccounts, getToken, getTransaction } from "./solana/tools.js";
import { addressInputSchema, addressSignaturesInputSchema, bridgeAddressActivityInputSchema, evmAddressInputSchema, evmAddressTransactionsInputSchema, evmContractInputSchema, evmListChainsInputSchema, evmTokenInputSchema, evmTraceTransactionInputSchema, evmTransactionInputSchema, programAccountsInputSchema, tokenInputSchema, transactionInputSchema } from "./types.js";

function toolResponse(value: Record<string, unknown>) {
  return {
    content: [{ type: "text" as const, text: JSON.stringify(value, null, 2) }],
    structuredContent: value,
  };
}

function toolFailure(error: unknown) {
  const message = error instanceof Error ? error.message : String(error);
  const code = error instanceof ToolError ? error.code : "INTERNAL_ERROR";
  return {
    isError: true,
    content: [{ type: "text" as const, text: JSON.stringify({ error: { code, message } }) }],
  };
}

export function createServer(connections: SolanaConnections, evmClients: EvmClients = createEvmClients(), chainstackClient: ChainstackTraceClient = createChainstackTraceClient()): McpServer {
  const server = new McpServer({ name: "chaintrace", version: "0.1.0" });
  server.registerTool(
    "solana_get_address",
    {
      title: "Get Solana address",
      description: "Get a Solana account snapshot, parsed token holdings, and raw RPC records.",
      inputSchema: addressInputSchema.shape,
    },
    async (input) => {
      try { return toolResponse(await getAddress(connections, input)); } catch (error) { return toolFailure(error); }
    },
  );
  server.registerTool(
    "solana_get_token",
    {
      title: "Get Solana token mint",
      description: "Get an SPL token mint, its on-chain Metaplex metadata, and raw RPC records.",
      inputSchema: tokenInputSchema.shape,
    },
    async (input) => {
      try { return toolResponse(await getToken(connections, input)); } catch (error) { return toolFailure(error); }
    },
  );
  server.registerTool(
    "solana_get_transaction",
    {
      title: "Get Solana transaction",
      description: "Get a parsed Solana transaction, execution metadata, and complete raw RPC response.",
      inputSchema: transactionInputSchema.shape,
    },
    async (input) => {
      try { return toolResponse(await getTransaction(connections, input)); } catch (error) { return toolFailure(error); }
    },
  );
  server.registerTool(
    "solana_get_address_signatures",
    {
      title: "Get Solana address signatures",
      description: "Get newest transaction signatures involving a Solana address. Use solana_get_transaction to inspect a selected signature.",
      inputSchema: addressSignaturesInputSchema.shape,
    },
    async (input) => {
      try { return toolResponse(await getAddressSignatures(connections, input)); } catch (error) { return toolFailure(error); }
    },
  );
  server.registerTool(
    "solana_get_program_accounts",
    {
      title: "Get Solana program accounts",
      description: "Get accounts owned by a Solana program, optionally narrowed with RPC dataSize/memcmp filters.",
      inputSchema: programAccountsInputSchema.shape,
    },
    async (input) => {
      try { return toolResponse(await getProgramAccounts(connections, input)); } catch (error) { return toolFailure(error); }
    },
  );
  server.registerTool(
    "evm_get_address",
    { title: "Get EVM address", description: "Get an EVM account's balance, nonce, deployed-code status, and raw RPC records. The configured RPC determines the chain ID.", inputSchema: evmAddressInputSchema.shape },
    async (input) => { try { return toolResponse(await getEvmAddress(evmClients, input)); } catch (error) { return toolFailure(error); } },
  );
  server.registerTool(
    "evm_list_chains",
    { title: "List EVM chain labels", description: "List accepted Chainstack tracing networks and provider-label aliases. Call this before choosing a network label when uncertain.", inputSchema: evmListChainsInputSchema.shape },
    async () => toolResponse(getEvmChains()),
  );
  server.registerTool(
    "bridge_get_address_activity",
    { title: "Get bridge address activity", description: "Get bridge activity for an EVM address from LI.FI Orders, Mayan Explorer, and Across. Returns normalized cross-chain source, destination, status, timestamps, and transaction hashes, with each provider's complete raw response.", inputSchema: bridgeAddressActivityInputSchema.shape },
    async (input) => { try { return toolResponse(await getBridgeAddressActivity(input)); } catch (error) { return toolFailure(error); } },
  );
  server.registerTool(
    "evm_get_transaction",
    { title: "Get EVM transaction", description: "Get a full EVM transaction and receipt by hash, with raw RPC records.", inputSchema: evmTransactionInputSchema.shape },
    async (input) => { try { return toolResponse(await getEvmTransaction(evmClients, input)); } catch (error) { return toolFailure(error); } },
  );
  server.registerTool(
    "evm_trace_transaction",
    { title: "Trace EVM transaction", description: "Call Chainstack's trace_transaction RPC to expose flat internal calls, value transfers, creates, delegatecalls, and reverts. Available only where Chainstack documents trace_transaction.", inputSchema: evmTraceTransactionInputSchema.shape },
    async (input) => { try { return toolResponse(await getEvmTraceTransaction(chainstackClient, input)); } catch (error) { return toolFailure(error); } },
  );
  server.registerTool(
    "evm_get_address_transactions",
    { title: "Get EVM address transfers", description: "Use Alchemy's Transfers API to get indexed incoming and outgoing transfers for an address. Use evm_get_transaction for full details of a selected hash.", inputSchema: evmAddressTransactionsInputSchema.shape },
    async (input) => { try { return toolResponse(await getEvmAddressTransactions(evmClients, input)); } catch (error) { return toolFailure(error); } },
  );
  server.registerTool(
    "evm_get_token",
    { title: "Get EVM token", description: "Get standard ERC-20 metadata and supply through eth_call, plus raw RPC records.", inputSchema: evmTokenInputSchema.shape },
    async (input) => { try { return toolResponse(await getEvmToken(evmClients, input)); } catch (error) { return toolFailure(error); } },
  );
  server.registerTool(
    "evm_get_contract",
    { title: "Get EVM contract", description: "Get contract bytecode details, EIP-1967 implementation-proxy detection, and a Sourcify verification summary.", inputSchema: evmContractInputSchema.shape },
    async (input) => { try { return toolResponse(await getEvmContract(evmClients, input)); } catch (error) { return toolFailure(error); } },
  );
  server.registerTool(
    "evm_get_contract_info",
    { title: "Get EVM contract info", description: "Get full verified contract ABI, metadata, and source information from Sourcify. Resolves EIP-1967 implementations first.", inputSchema: evmContractInputSchema.shape },
    async (input) => { try { return toolResponse(await getEvmContractInfo(evmClients, input)); } catch (error) { return toolFailure(error); } },
  );
  return server;
}
