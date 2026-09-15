import { describe, expect, it } from "vitest";
import { alchemyRpcUrl, createEvmClients, isAlchemyEvmChain, normalizeAlchemyChain } from "../src/evm/config.js";

describe("Alchemy EVM configuration", () => {
  it("constructs network endpoints from a chain slug and one API key", () => {
    expect(alchemyRpcUrl("robinhood-mainnet", "key")).toBe("https://robinhood-mainnet.g.alchemy.com/v2/key");
    expect(alchemyRpcUrl("shape-mainnet", "key")).toBe("https://shape-mainnet.g.alchemy.com/v2/key");
  });

  it("requires the single Alchemy API key", () => {
    expect(() => createEvmClients({}).get("shape-mainnet")).toThrow("ALCHEMY_API_KEY");
  });

  it("accepts only exact Alchemy EVM slugs", () => {
    expect(normalizeAlchemyChain("eth-mainnet")).toBe("eth-mainnet");
    expect(isAlchemyEvmChain("eth-mainnet")).toBe(true);
    expect(isAlchemyEvmChain("ethereum-mainnet")).toBe(false);
    expect(isAlchemyEvmChain("bsc-mainnet")).toBe(false);
    expect(() => createEvmClients({ ALCHEMY_API_KEY: "key" }).get("ethereum-mainnet")).toThrow("evm_list_chains");
  });
});
