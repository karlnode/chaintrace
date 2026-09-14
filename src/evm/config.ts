import { createPublicClient, http, type PublicClient } from "viem";
import { ToolError } from "../shared/errors.js";

export interface EvmClients {
  get(chain: string): PublicClient;
}

/** Common human/provider labels mapped to the exact Alchemy network slug. */
const ALCHEMY_CHAIN_ALIASES: Record<string, string> = {
  "bsc-mainnet": "bnb-mainnet",
  bsc: "bnb-mainnet",
  "binance-smart-chain": "bnb-mainnet",
  "binance-smart-chain-mainnet": "bnb-mainnet",
};

export function normalizeAlchemyChain(chain: string): string {
  return ALCHEMY_CHAIN_ALIASES[chain] ?? chain;
}

export function alchemyChainAliases(): Array<{ input: string; alchemyNetwork: string }> {
  return Object.entries(ALCHEMY_CHAIN_ALIASES).map(([input, alchemyNetwork]) => ({ input, alchemyNetwork }));
}

export function alchemyRpcUrl(chain: string, apiKey: string): string {
  return `https://${chain}.g.alchemy.com/v2/${apiKey}`;
}

/**
 * Chain labels are Alchemy network slugs (for example, robinhood-mainnet).
 * A single API key is used to construct the endpoint; the provider determines
 * the authoritative EVM chain ID at request time.
 */
export function createEvmClients(env = process.env): EvmClients {
  return {
    get(chain) {
      const apiKey = env.ALCHEMY_API_KEY;
      if (!apiKey) {
        throw new ToolError("No Alchemy API key configured. Set ALCHEMY_API_KEY.", "RPC_NOT_CONFIGURED");
      }
      return createPublicClient({ transport: http(alchemyRpcUrl(normalizeAlchemyChain(chain), apiKey)) });
    },
  };
}
