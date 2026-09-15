import { createPublicClient, http, type PublicClient } from "viem";
import { ToolError } from "../shared/errors.js";

export interface EvmClients {
  get(chain: string): PublicClient;
}

/** Exact EVM network slugs from Alchemy's supported HTTP URL list. */
const ALCHEMY_EVM_CHAIN_SLUGS = [
  "worldchain-mainnet", "worldchain-sepolia", "shape-mainnet", "shape-sepolia",
  "eth-mainnet", "eth-sepolia", "eth-holesky", "eth-hoodi", "eth-mainnetbeacon", "eth-sepoliabeacon", "eth-holeskybeacon", "eth-hoodibeacon",
  "zksync-mainnet", "zksync-sepolia", "opt-mainnet", "opt-sepolia", "polygon-mainnet", "polygon-amoy", "arb-mainnet", "arb-sepolia",
  "astar-mainnet", "zetachain-mainnet", "zetachain-testnet", "mantle-mainnet", "mantle-sepolia", "berachain-mainnet", "berachain-bepolia",
  "blast-mainnet", "blast-sepolia", "linea-mainnet", "linea-sepolia", "zora-mainnet", "zora-sepolia", "ronin-mainnet", "ronin-saigon",
  "plasma-mainnet", "plasma-testnet", "standard-mainnet", "mythos-mainnet", "settlus-mainnet", "settlus-septestnet", "earnm-sepolia", "earnm-mainnet",
  "xprotocol-mainnet", "bob-mainnet", "bob-sepolia", "megaeth-mainnet", "megaeth-testnet", "rootstock-mainnet", "rootstock-testnet", "worldl3-devnet",
  "citrea-testnet", "citrea-mainnet", "tea-sepolia", "gensyn-testnet", "gensyn-mainnet", "arc-testnet", "story-mainnet", "story-aeneid",
  "humanity-mainnet", "humanity-testnet", "base-mainnet", "base-sepolia", "tempo-mainnet", "tempo-moderato", "hyperliquid-mainnet", "hyperliquid-testnet",
  "galactica-mainnet", "galactica-cassiopeia", "lens-mainnet", "lens-sepolia", "worldmobilechain-mainnet", "frax-mainnet", "frax-hoodi",
  "ink-mainnet", "ink-sepolia", "avax-mainnet", "avax-fuji", "gnosis-mainnet", "gnosis-chiado", "celestiabridge-mainnet", "celestiabridge-mocha",
  "bnb-mainnet", "bnb-testnet", "alchemyarb-fam", "alchemyarb-sepolia", "boba-mainnet", "boba-sepolia", "unichain-mainnet", "unichain-sepolia",
  "superseed-mainnet", "superseed-sepolia", "rise-mainnet", "rise-testnet", "monad-testnet", "monad-mainnet", "flow-mainnet", "flow-testnet",
  "openloot-sepolia", "worldmobile-devnet", "worldmobile-testnet", "unite-mainnet", "unite-testnet", "polynomial-mainnet", "polynomial-sepolia",
  "mode-mainnet", "mode-sepolia", "edge-mainnet", "edge-testnet", "moonbeam-mainnet", "alchemy-sepolia", "alchemy-internal", "apechain-mainnet", "apechain-curtis",
  "celo-mainnet", "celo-sepolia", "anime-mainnet", "anime-sepolia", "alterscope-mainnet", "metis-mainnet", "sonic-mainnet", "sonic-testnet",
  "sei-mainnet", "sei-testnet", "xmtp-ropsten", "xmtp-mainnet", "adi-testnet", "adi-mainnet", "scroll-mainnet", "opbnb-mainnet", "opbnb-testnet",
  "race-mainnet", "race-sepolia", "crossfi-testnet", "crossfi-mainnet", "abstract-mainnet", "abstract-testnet", "soneium-mainnet", "soneium-minato",
  "stable-mainnet", "stable-testnet", "robinhood-mainnet", "robinhood-testnet",
] as const;

const ALCHEMY_EVM_CHAIN_SET = new Set<string>(ALCHEMY_EVM_CHAIN_SLUGS);

export function normalizeAlchemyChain(chain: string): string {
  return chain;
}

export function alchemyChainSlugs(): string[] {
  return [...ALCHEMY_EVM_CHAIN_SLUGS];
}

export function isAlchemyEvmChain(chain: string): boolean {
  return ALCHEMY_EVM_CHAIN_SET.has(chain);
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
      if (!isAlchemyEvmChain(chain)) {
        throw new ToolError(`Unsupported Alchemy EVM chain slug '${chain}'. Use evm_list_chains to see all supported slugs.`, "INVALID_EVM_CHAIN");
      }
      return createPublicClient({ transport: http(alchemyRpcUrl(chain, apiKey)) });
    },
  };
}
