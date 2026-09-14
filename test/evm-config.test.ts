import { describe, expect, it } from "vitest";
import { alchemyRpcUrl, createEvmClients } from "../src/evm/config.js";

describe("Alchemy EVM configuration", () => {
  it("constructs network endpoints from a chain slug and one API key", () => {
    expect(alchemyRpcUrl("robinhood-mainnet", "key")).toBe("https://robinhood-mainnet.g.alchemy.com/v2/key");
    expect(alchemyRpcUrl("shape-mainnet", "key")).toBe("https://shape-mainnet.g.alchemy.com/v2/key");
  });

  it("requires the single Alchemy API key", () => {
    expect(() => createEvmClients({}).get("shape-mainnet")).toThrow("ALCHEMY_API_KEY");
  });
});
