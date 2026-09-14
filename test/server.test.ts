import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { describe, expect, it } from "vitest";
import { createServer } from "../src/server.js";
import type { SolanaConnections } from "../src/solana/config.js";

describe("MCP server", () => {
  it("advertises the three Solana tools", async () => {
    const connections: SolanaConnections = { get: () => { throw new Error("not called during discovery"); } };
    const server = createServer(connections);
    const client = new Client({ name: "test-client", version: "1.0.0" });
    const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
    await Promise.all([server.connect(serverTransport), client.connect(clientTransport)]);
    const tools = await client.listTools();
    expect(tools.tools.map((tool) => tool.name).sort()).toEqual([
      "evm_get_address", "evm_get_address_transactions", "evm_get_contract", "evm_get_contract_info", "evm_get_token", "evm_get_transaction",
      "solana_get_address", "solana_get_address_signatures", "solana_get_program_accounts", "solana_get_token", "solana_get_transaction",
    ]);
    await Promise.all([client.close(), server.close()]);
  });
});
