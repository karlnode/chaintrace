import { TOKEN_2022_PROGRAM_ID, TOKEN_PROGRAM_ID } from "@solana/spl-token";
import type { Connection } from "@solana/web3.js";
import { asToolError, ToolError } from "../shared/errors.js";
import { jsonSafe, sol, utcTime } from "../shared/json.js";
import type { Cluster, JsonRecord } from "../types.js";
import type { SolanaConnections } from "./config.js";
import { decodeMetadata, metadataAddress, TOKEN_METADATA_PROGRAM_ID } from "./metadata.js";
import { publicKey, signature } from "./validation.js";

export interface ToolResult {
  [key: string]: unknown;
  cluster: Cluster;
  raw: JsonRecord;
}

function rpc(connectionSet: SolanaConnections, cluster: Cluster): Connection {
  return connectionSet.get(cluster);
}

function programAccountsRpc(connectionSet: SolanaConnections, cluster: Cluster): Connection {
  return connectionSet.get(cluster, "program-accounts");
}

function parsedTokenHolding(entry: any): JsonRecord {
  const info = entry.account.data.parsed.info;
  return {
    tokenAccount: entry.pubkey.toBase58(),
    programId: entry.account.owner.toBase58(),
    mint: info.mint,
    owner: info.owner,
    amount: info.tokenAmount.amount,
    decimals: info.tokenAmount.decimals,
    uiAmountString: info.tokenAmount.uiAmountString,
    delegate: info.delegate ?? null,
    state: info.state,
    isNative: info.isNative ?? false,
  };
}

export async function getAddress(connections: SolanaConnections, input: { address: string; cluster: Cluster }): Promise<ToolResult> {
  const key = publicKey(input.address, "address");
  try {
    const connection = rpc(connections, input.cluster);
    const [accountResponse, classicTokens, token2022Tokens] = await Promise.all([
      connection.getAccountInfoAndContext(key),
      connection.getParsedTokenAccountsByOwner(key, { programId: TOKEN_PROGRAM_ID }),
      connection.getParsedTokenAccountsByOwner(key, { programId: TOKEN_2022_PROGRAM_ID }),
    ]);
    const account = accountResponse.value;
    if (!account) throw new ToolError(`Account ${input.address} was not found on ${input.cluster}.`, "ACCOUNT_NOT_FOUND");
    const holdings = [...classicTokens.value, ...token2022Tokens.value].map(parsedTokenHolding);
    return {
      cluster: input.cluster,
      address: key.toBase58(),
      account: {
        lamports: String(account.lamports),
        solBalance: sol(account.lamports),
        owner: account.owner.toBase58(),
        executable: account.executable,
        rentEpoch: String(account.rentEpoch),
        dataLength: account.data.length,
      },
      tokenHoldings: holdings,
      raw: {
        accountInfo: jsonSafe(accountResponse),
        splTokenAccounts: jsonSafe(classicTokens),
        token2022Accounts: jsonSafe(token2022Tokens),
      },
    };
  } catch (error) {
    throw asToolError(error);
  }
}

export async function getToken(connections: SolanaConnections, input: { mint: string; cluster: Cluster }): Promise<ToolResult> {
  const mint = publicKey(input.mint, "mint");
  try {
    const connection = rpc(connections, input.cluster);
    const metadataKey = metadataAddress(mint);
    const [mintResponse, parsedMintResponse, metadataResponse] = await Promise.all([
      connection.getAccountInfoAndContext(mint),
      connection.getParsedAccountInfo(mint),
      connection.getAccountInfoAndContext(metadataKey),
    ]);
    const mintAccount = mintResponse.value;
    if (!mintAccount) throw new ToolError(`Mint ${input.mint} was not found on ${input.cluster}.`, "MINT_NOT_FOUND");
    if (!mintAccount.owner.equals(TOKEN_PROGRAM_ID) && !mintAccount.owner.equals(TOKEN_2022_PROGRAM_ID)) {
      throw new ToolError(`${input.mint} is not owned by an SPL Token or Token-2022 program.`, "NOT_A_TOKEN_MINT");
    }
    const parsed = parsedMintResponse.value?.data;
    const info = parsed && "parsed" in parsed ? (parsed as any).parsed.info : undefined;
    let metadata: JsonRecord | null = null;
    let metadataWarning: string | undefined;
    if (metadataResponse.value) {
      if (metadataResponse.value.owner.equals(TOKEN_METADATA_PROGRAM_ID)) {
        try {
          metadata = jsonSafe(decodeMetadata(metadataResponse.value.data, metadataKey)) as JsonRecord;
        } catch (error) {
          metadataWarning = `Could not decode on-chain metadata: ${error instanceof Error ? error.message : String(error)}`;
        }
      } else {
        metadataWarning = "Derived metadata account is not owned by the Metaplex Token Metadata program.";
      }
    }
    return {
      cluster: input.cluster,
      mint: mint.toBase58(),
      tokenProgram: mintAccount.owner.toBase58(),
      mintInfo: info
        ? {
            supply: info.supply,
            decimals: info.decimals,
            isInitialized: info.isInitialized,
            mintAuthority: info.mintAuthority ?? null,
            freezeAuthority: info.freezeAuthority ?? null,
          }
        : null,
      metadata,
      ...(metadataWarning ? { metadataWarning } : {}),
      raw: {
        mintAccountInfo: jsonSafe(mintResponse),
        parsedMintAccountInfo: jsonSafe(parsedMintResponse),
        metadataAccountInfo: jsonSafe(metadataResponse),
      },
    };
  } catch (error) {
    throw asToolError(error);
  }
}

export async function getTransaction(connections: SolanaConnections, input: { signature: string; cluster: Cluster }): Promise<ToolResult> {
  const txSignature = signature(input.signature);
  try {
    const transaction = await rpc(connections, input.cluster).getTransaction(txSignature, {
      commitment: "confirmed",
      maxSupportedTransactionVersion: 0,
    });
    if (!transaction) {
      throw new ToolError(`Transaction ${txSignature} was not found or is not available on ${input.cluster}.`, "TRANSACTION_NOT_FOUND");
    }
    return {
      cluster: input.cluster,
      signature: txSignature,
      slot: String(transaction.slot),
      blockTime: transaction.blockTime,
      blockTimeUtc: utcTime(transaction.blockTime),
      version: transaction.version,
      status: transaction.meta?.err ? "failed" : "success",
      error: transaction.meta?.err ?? null,
      feeLamports: transaction.meta ? String(transaction.meta.fee) : null,
      feeSol: transaction.meta ? sol(transaction.meta.fee) : null,
      logMessages: transaction.meta?.logMessages ?? null,
      preBalances: transaction.meta?.preBalances.map(String) ?? null,
      postBalances: transaction.meta?.postBalances.map(String) ?? null,
      preTokenBalances: transaction.meta?.preTokenBalances ?? [],
      postTokenBalances: transaction.meta?.postTokenBalances ?? [],
      message: jsonSafe(transaction.transaction.message),
      innerInstructions: jsonSafe(transaction.meta?.innerInstructions ?? []),
      raw: { transaction: jsonSafe(transaction) as JsonRecord },
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (/maxSupportedTransactionVersion|unsupported transaction version/i.test(message)) {
      throw new ToolError(`Transaction ${txSignature} uses a transaction version unsupported by this server.`, "UNSUPPORTED_TRANSACTION_VERSION");
    }
    throw asToolError(error);
  }
}

export async function getAddressSignatures(
  connections: SolanaConnections,
  input: { address: string; cluster: Cluster; limit: number; before?: string },
): Promise<ToolResult> {
  const address = publicKey(input.address, "address");
  const before = input.before ? signature(input.before) : undefined;
  try {
    const connection = rpc(connections, input.cluster);
    const signatures = await connection.getSignaturesForAddress(address, { limit: input.limit, ...(before ? { before } : {}) }, "confirmed");
    return {
      cluster: input.cluster,
      address: address.toBase58(),
      count: signatures.length,
      signatures: signatures.map((entry) => ({
        signature: entry.signature,
        slot: String(entry.slot),
        blockTime: entry.blockTime,
        blockTimeUtc: utcTime(entry.blockTime),
        confirmationStatus: entry.confirmationStatus,
        error: entry.err,
        memo: entry.memo,
      })),
      raw: { signatures: jsonSafe(signatures) },
    };
  } catch (error) {
    throw asToolError(error);
  }
}

export async function getProgramAccounts(
  connections: SolanaConnections,
  input: { programId: string; cluster: Cluster; filters?: unknown[]; dataSlice?: { offset: number; length: number }; limit: number },
): Promise<ToolResult> {
  const programId = publicKey(input.programId, "programId");
  try {
    const connection = programAccountsRpc(connections, input.cluster);
    const accounts = await connection.getProgramAccounts(programId, {
      commitment: "confirmed",
      ...(input.filters ? { filters: input.filters as any } : {}),
      ...(input.dataSlice ? { dataSlice: input.dataSlice } : {}),
    });
    const returned = accounts.slice(0, input.limit);
    return {
      cluster: input.cluster,
      programId: programId.toBase58(),
      rpcEndpoint: connection.rpcEndpoint,
      matchingAccountCount: accounts.length,
      returnedAccountCount: returned.length,
      truncated: accounts.length > returned.length,
      accounts: returned.map((entry) => ({
        address: entry.pubkey.toBase58(),
        owner: entry.account.owner.toBase58(),
        lamports: String(entry.account.lamports),
        executable: entry.account.executable,
        rentEpoch: String(entry.account.rentEpoch),
        dataLength: entry.account.data.length,
      })),
      raw: { accounts: jsonSafe(returned), filters: input.filters ?? [], dataSlice: input.dataSlice ?? null },
    };
  } catch (error) {
    throw asToolError(error);
  }
}
