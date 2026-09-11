#!/usr/bin/env node
// MCP stdio reserves stdout exclusively for JSON-RPC. Some optional Solana
// dependencies emit load warnings through console; keep those off stdout.
console.log = (...args: unknown[]) => console.error(...args);
console.warn = (...args: unknown[]) => console.error(...args);

const [{ StdioServerTransport }, { createServer }, { createConnections }] = await Promise.all([
  import("@modelcontextprotocol/sdk/server/stdio.js"),
  import("./server.js"),
  import("./solana/config.js"),
]);
const server = createServer(createConnections());
await server.connect(new StdioServerTransport());
// Keep a piped stdin in flowing mode while the MCP client is connected.
process.stdin.resume();
