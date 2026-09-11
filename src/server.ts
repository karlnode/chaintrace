import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { ToolError } from "./shared/errors.js";
import type { SolanaConnections } from "./solana/config.js";
import { getAddress, getAddressSignatures, getProgramAccounts, getToken, getTransaction } from "./solana/tools.js";
import { addressInputSchema, addressSignaturesInputSchema, programAccountsInputSchema, tokenInputSchema, transactionInputSchema } from "./types.js";

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

export function createServer(connections: SolanaConnections): McpServer {
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
  return server;
}
