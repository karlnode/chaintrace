import { z } from "zod";

export const clusterSchema = z.enum(["mainnet-beta", "devnet"]);
export type Cluster = z.infer<typeof clusterSchema>;

export const addressInputSchema = z.object({
  address: z.string().min(32).max(44).describe("Solana base58 account address"),
  cluster: clusterSchema.default("mainnet-beta"),
});

export const tokenInputSchema = z.object({
  mint: z.string().min(32).max(44).describe("SPL token mint address"),
  cluster: clusterSchema.default("mainnet-beta"),
});

export const transactionInputSchema = z.object({
  signature: z.string().min(64).max(128).describe("Solana transaction signature"),
  cluster: clusterSchema.default("mainnet-beta"),
});

export const addressSignaturesInputSchema = z.object({
  address: z.string().min(32).max(44).describe("Solana base58 account address"),
  cluster: clusterSchema.default("mainnet-beta"),
  limit: z.number().int().min(1).max(50).default(10).describe("Number of newest transaction signatures to return (maximum 50)"),
  before: z.string().min(64).max(128).optional().describe("Return signatures older than this transaction signature"),
});

const programAccountFilterSchema = z.union([
  z.object({ dataSize: z.number().int().nonnegative() }),
  z.object({ memcmp: z.object({ offset: z.number().int().nonnegative(), bytes: z.string().min(1) }) }),
]);

export const programAccountsInputSchema = z.object({
  programId: z.string().min(32).max(44).describe("Solana program public key"),
  cluster: clusterSchema.default("mainnet-beta"),
  filters: z.array(programAccountFilterSchema).max(8).optional().describe("Optional Solana RPC dataSize or memcmp filters"),
  dataSlice: z.object({ offset: z.number().int().nonnegative(), length: z.number().int().min(0).max(65536) }).optional()
    .describe("Optional byte slice for each raw account data payload"),
  limit: z.number().int().min(1).max(500).default(100).describe("Maximum matching accounts returned to the MCP client"),
});

export type JsonRecord = Record<string, unknown>;

export const evmChainSchema = z.string().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/).describe("Configured EVM network label, for example robinhood-mainnet");
const evmAddressSchema = z.string().regex(/^0x[0-9a-fA-F]{40}$/).describe("EVM address");

export const evmAddressInputSchema = z.object({ address: evmAddressSchema, chain: evmChainSchema });
export const evmTransactionInputSchema = z.object({ hash: z.string().regex(/^0x[0-9a-fA-F]{64}$/).describe("EVM transaction hash"), chain: evmChainSchema });
export const evmAddressTransactionsInputSchema = z.object({
  address: evmAddressSchema,
  chain: evmChainSchema,
  maxCount: z.number().int().min(1).max(1000).default(50),
  pageKey: z.string().min(1).optional().describe("Alchemy page key from a previous result"),
  direction: z.enum(["from", "to", "both"]).default("both").describe("Transfer direction; use from or to when paginating"),
});
export const evmTokenInputSchema = z.object({ address: evmAddressSchema, chain: evmChainSchema });
export const evmContractInputSchema = z.object({ address: evmAddressSchema, chain: evmChainSchema });
