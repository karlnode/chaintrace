import { Connection } from "@solana/web3.js";
import type { Cluster } from "../types.js";
import { ToolError } from "../shared/errors.js";

export interface SolanaConnections {
  get(cluster: Cluster, purpose?: RpcPurpose): Connection;
}

export type RpcPurpose = "general" | "program-accounts";

export function createConnections(env = process.env): SolanaConnections {
  const endpoints: Record<Cluster, Record<RpcPurpose, string | undefined>> = {
    "mainnet-beta": {
      general: env.SOLANA_MAINNET_RPC_URL,
      "program-accounts": env.SOLANA_PROGRAM_ACCOUNTS_MAINNET_RPC_URL ?? env.SOLANA_MAINNET_RPC_URL,
    },
    devnet: {
      general: env.SOLANA_DEVNET_RPC_URL,
      "program-accounts": env.SOLANA_PROGRAM_ACCOUNTS_DEVNET_RPC_URL ?? env.SOLANA_DEVNET_RPC_URL,
    },
  };
  return {
    get(cluster, purpose = "general") {
      const url = endpoints[cluster][purpose];
      if (!url) {
        const variable = cluster === "devnet" ? "SOLANA_DEVNET_RPC_URL" : "SOLANA_MAINNET_RPC_URL";
        throw new ToolError(
          `No ${purpose} RPC endpoint configured for ${cluster}. Set ${variable}.`,
          "RPC_NOT_CONFIGURED",
        );
      }
      return new Connection(url, "confirmed");
    },
  };
}
