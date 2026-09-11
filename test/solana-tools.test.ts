import { TOKEN_2022_PROGRAM_ID, TOKEN_PROGRAM_ID } from "@solana/spl-token";
import { PublicKey } from "@solana/web3.js";
import { describe, expect, it } from "vitest";
import type { SolanaConnections } from "../src/solana/config.js";
import { getAddress, getAddressSignatures, getProgramAccounts, getToken, getTransaction } from "../src/solana/tools.js";

const key = new PublicKey("11111111111111111111111111111111");
const account = { data: Buffer.from("raw account"), executable: false, lamports: 2_000_000_000, owner: key, rentEpoch: 9 };

function connections(connection: object): SolanaConnections {
  return { get: () => connection as any };
}

describe("Solana tool handlers", () => {
  it("formats an address snapshot and retains raw account/token records", async () => {
    const connection = {
      getAccountInfoAndContext: async () => ({ context: { slot: 10 }, value: account }),
      getParsedTokenAccountsByOwner: async (_key: PublicKey, filter: { programId: PublicKey }) => ({
        context: { slot: 10 },
        value: filter.programId.equals(TOKEN_PROGRAM_ID) ? [{
          pubkey: key,
          account: { owner: TOKEN_PROGRAM_ID, data: { parsed: { info: { mint: "mint", owner: key.toBase58(), tokenAmount: { amount: "42", decimals: 6, uiAmountString: "0.000042" }, state: "initialized" } } }, executable: false, lamports: 1, rentEpoch: 0 },
        }] : [],
      }),
    };
    const result = await getAddress(connections(connection), { address: key.toBase58(), cluster: "devnet" });
    expect(result).toMatchObject({ cluster: "devnet", account: { solBalance: "2" }, tokenHoldings: [{ amount: "42" }] });
    expect((result.raw.accountInfo as any).value.data).toBe("cmF3IGFjY291bnQ=");
  });

  it("reports a missing address as an actionable tool error", async () => {
    const connection = {
      getAccountInfoAndContext: async () => ({ context: {}, value: null }),
      getParsedTokenAccountsByOwner: async () => ({ context: {}, value: [] }),
    };
    await expect(getAddress(connections(connection), { address: key.toBase58(), cluster: "devnet" })).rejects.toMatchObject({ code: "ACCOUNT_NOT_FOUND" });
  });

  it("formats a mint and leaves absent metadata as null", async () => {
    const mintAccount = { ...account, owner: TOKEN_2022_PROGRAM_ID };
    const connection = {
      getAccountInfoAndContext: async (address: PublicKey) => ({ context: { slot: 11 }, value: address.equals(key) ? mintAccount : null }),
      getParsedAccountInfo: async () => ({ context: { slot: 11 }, value: { data: { parsed: { info: { supply: "1000", decimals: 9, isInitialized: true, mintAuthority: null, freezeAuthority: null } } } } }),
    };
    const result = await getToken(connections(connection), { mint: key.toBase58(), cluster: "mainnet-beta" });
    expect(result).toMatchObject({ tokenProgram: TOKEN_2022_PROGRAM_ID.toBase58(), mintInfo: { supply: "1000" }, metadata: null });
  });

  it("returns parsed transaction information and raw payload", async () => {
    const connection = {
      getTransaction: async () => ({
        slot: 12, blockTime: 1_700_000_000, version: 0,
        transaction: { message: { accountKeys: [{ pubkey: key, signer: true, writable: true }], instructions: [] } },
        meta: { err: null, fee: 5000, logMessages: ["log"], preBalances: [2_000], postBalances: [1_000], preTokenBalances: [], postTokenBalances: [], innerInstructions: [] },
      }),
    };
    const result = await getTransaction(connections(connection), { signature: "1".repeat(64), cluster: "devnet" });
    expect(result).toMatchObject({ status: "success", feeLamports: "5000", preBalances: ["2000"], raw: { transaction: { slot: 12 } } });
  });

  it("gets bounded address signatures without fetching transaction details", async () => {
    const connection = {
      getSignaturesForAddress: async () => [{ signature: "2".repeat(64), slot: 14, err: null, memo: null, blockTime: null, confirmationStatus: "confirmed" }],
    };
    const result = await getAddressSignatures(connections(connection), { address: key.toBase58(), cluster: "devnet", limit: 10 });
    expect(result).toMatchObject({ count: 1, signatures: [{ signature: "2".repeat(64), slot: "14", blockTimeUtc: null, confirmationStatus: "confirmed" }], raw: { signatures: [{ slot: 14 }] } });
  });

  it("returns limited program accounts and reports truncation", async () => {
    const connection = { getProgramAccounts: async () => [{ pubkey: key, account }, { pubkey: TOKEN_PROGRAM_ID, account }] };
    const result = await getProgramAccounts(connections(connection), { programId: key.toBase58(), cluster: "devnet", limit: 1 });
    expect(result).toMatchObject({ matchingAccountCount: 2, returnedAccountCount: 1, truncated: true, accounts: [{ address: key.toBase58(), lamports: "2000000000" }] });
  });
});
