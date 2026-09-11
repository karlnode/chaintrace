import { describe, expect, it } from "vitest";
import { createConnections } from "../src/solana/config.js";

describe("RPC capability routing", () => {
  it("falls back to the configured general endpoint for program-account scans", () => {
    const connections = createConnections({
      SOLANA_MAINNET_RPC_URL: "https://general.example",
      SOLANA_DEVNET_RPC_URL: "https://devnet-general.example",
    });
    expect(connections.get("mainnet-beta").rpcEndpoint).toBe("https://general.example");
    expect(connections.get("mainnet-beta", "program-accounts").rpcEndpoint).toBe("https://general.example");
  });

  it("allows a dedicated program-account endpoint to override the general endpoint", () => {
    const connections = createConnections({
      SOLANA_MAINNET_RPC_URL: "https://general.example",
      SOLANA_PROGRAM_ACCOUNTS_MAINNET_RPC_URL: "https://scan-provider.example",
    });
    expect(connections.get("mainnet-beta", "program-accounts").rpcEndpoint).toBe("https://scan-provider.example");
  });
});
