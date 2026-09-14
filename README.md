# Chaintrace MCP

Read-only Solana and EVM blockchain data for Codex and other Model Context Protocol clients. It runs locally over stdio and sends requests only to configured RPC endpoints.

## Install and run

```bash
pnpm install
pnpm build
```

Set an endpoint for every cluster you intend to query:

```bash
export SOLANA_MAINNET_RPC_URL="https://your-mainnet-rpc.example"
export SOLANA_DEVNET_RPC_URL="https://your-devnet-rpc.example"
export ALCHEMY_API_KEY="your-alchemy-api-key"
```

Chaintrace loads this project-root `.env` file when it starts. Variables configured directly in Codex still take precedence.

`solana_get_program_accounts` uses `SOLANA_PROGRAM_ACCOUNTS_MAINNET_RPC_URL` (or `SOLANA_PROGRAM_ACCOUNTS_DEVNET_RPC_URL`) when set; otherwise it falls back to the matching general RPC endpoint. Set the dedicated variable to Solana's public RPC if your general provider does not support program-account scans.

Configure an MCP client to run the compiled executable:

```json
{
  "mcpServers": {
    "chaintrace": {
      "command": "node",
      "args": ["/absolute/path/to/chaintrace/dist/index.js"],
      "env": {
        "SOLANA_MAINNET_RPC_URL": "https://your-mainnet-rpc.example",
        "SOLANA_DEVNET_RPC_URL": "https://your-devnet-rpc.example",
        "SOLANA_PROGRAM_ACCOUNTS_MAINNET_RPC_URL": "https://api.mainnet.solana.com",
        "ALCHEMY_API_KEY": "your-alchemy-api-key"
      }
    }
  }
}
```

## Tools

- `solana_get_address({ address, cluster? })` returns an existing account’s SOL balance, program owner, execution/rent state, SPL Token and Token-2022 holdings, and raw RPC records.
- `solana_get_token({ mint, cluster? })` returns SPL mint state and on-chain Metaplex metadata (name, symbol, URI) when present. Metadata URI JSON is deliberately not fetched.
- `solana_get_transaction({ signature, cluster? })` returns parsed message/instructions, execution metadata, balances, token balance changes, logs, and the full raw RPC transaction response.
- `solana_get_address_signatures({ address, cluster?, limit?, before? })` returns newest transaction signatures involving an address. It defaults to 10 and permits at most 50, with `before` for backward pagination; call `solana_get_transaction` to inspect a chosen signature.
- `solana_get_program_accounts({ programId, cluster?, filters?, dataSlice?, limit? })` returns program-owned accounts and raw account data. It supports Solana `dataSize`/`memcmp` RPC filters, optional data slicing, and returns at most 100 accounts by default (500 maximum). Use filters for large programs.
- `evm_get_address({ address, chain })` returns an EVM address's native balance, nonce, EOA/contract classification, and raw RPC data.
- `evm_get_transaction({ hash, chain })` returns a full EVM transaction and receipt; when Sourcify has a verified ABI, it decodes calldata and receipt events automatically.
- `evm_get_address_transactions({ address, chain, direction?, maxCount?, pageKey? })` queries Alchemy's indexed Transfers API. It returns transfer hashes; inspect one with `evm_get_transaction`.
- `evm_get_token({ address, chain })` returns standard ERC-20 name, symbol, decimals, and supply when supported by the contract.
- `evm_get_contract({ address, chain })` returns deployed code size, EIP-1967 implementation-proxy detection, and a Sourcify verification summary.
- `evm_get_contract_info({ address, chain })` returns full verified ABI, metadata, and source information from Sourcify, resolving an EIP-1967 implementation first.

`cluster` is `mainnet-beta` by default and may be `devnet`. All loss-prone integer values are JSON strings. Where Solana supplies `blockTime`, results include both the Unix-seconds value and `blockTimeUtc` as an ISO-8601 UTC timestamp. Each successful result has a `raw` object containing the relevant JSON-RPC records; raw binary account data is base64 encoded.

This release does not trace fund flows or analyze program bytecode yet. Those capabilities can be added as separate Solana tools, and EVM support will add separate `evm_*` tool names rather than force a shared incompatible chain model.

## EVM configuration

EVM tools require a `chain` label on every call. It is an Alchemy network slug, not a hard-coded registry: Chaintrace builds `https://<chain>.g.alchemy.com/v2/<ALCHEMY_API_KEY>`. For example, `chain: "robinhood-mainnet"` uses `https://robinhood-mainnet.g.alchemy.com/v2/...`; `chain: "shape-mainnet"` works the same way. The RPC endpoint supplies the authoritative chain ID through `eth_chainId`, and every response includes it.

`evm_get_address_transactions` requires an Alchemy endpoint because it uses `alchemy_getAssetTransfers`; all other EVM tools use standard EVM JSON-RPC methods. Its cross-chain default includes native external transfers and standard token transfers; Alchemy only supports internal-transfer data on a subset of networks.

Sourcify lookups are automatic and use `https://sourcify.dev/server` by default. Set `SOURCIFY_SERVER_URL` to use a compatible self-hosted server. Unverified or unavailable Sourcify data never prevents raw EVM RPC results from being returned.

## Development

```bash
pnpm typecheck
pnpm test
pnpm build
```
