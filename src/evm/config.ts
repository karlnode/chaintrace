import { createPublicClient, http, type PublicClient } from "viem";
import { ToolError } from "../shared/errors.js";

export interface EvmClients {
  get(chain: string): PublicClient;
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
      return createPublicClient({ transport: http(alchemyRpcUrl(chain, apiKey)) });
    },
  };
}
