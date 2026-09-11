# Chaintrace MCP

Read-only Solana blockchain data for Codex and other Model Context Protocol clients. It runs locally over stdio and sends requests only to the configured Solana JSON-RPC endpoint.

## Install and run

```bash
pnpm install
pnpm build
```

Set an endpoint for every cluster you intend to query:

```bash
export SOLANA_MAINNET_RPC_URL="https://your-mainnet-rpc.example"
export SOLANA_DEVNET_RPC_URL="https://your-devnet-rpc.example"
```

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
        "SOLANA_PROGRAM_ACCOUNTS_MAINNET_RPC_URL": "https://api.mainnet.solana.com"
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

`cluster` is `mainnet-beta` by default and may be `devnet`. All loss-prone integer values are JSON strings. Where Solana supplies `blockTime`, results include both the Unix-seconds value and `blockTimeUtc` as an ISO-8601 UTC timestamp. Each successful result has a `raw` object containing the relevant JSON-RPC records; raw binary account data is base64 encoded.

This release does not trace fund flows or analyze program bytecode yet. Those capabilities can be added as separate Solana tools, and EVM support will add separate `evm_*` tool names rather than force a shared incompatible chain model.

## Development

```bash
pnpm typecheck
pnpm test
pnpm build
```
