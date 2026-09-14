#!/usr/bin/env node
import dotenv from "dotenv";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

// MCP stdio reserves stdout exclusively for JSON-RPC. Some optional Solana
// dependencies emit load warnings through console; keep those off stdout.
console.log = (...args: unknown[]) => console.error(...args);
console.warn = (...args: unknown[]) => console.error(...args);

// Resolve from the executable location rather than process.cwd(), because MCP
// clients may launch this server from outside the project directory. Existing
// MCP-configured environment variables take precedence over .env values.
const entryDirectory = dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: resolve(entryDirectory, "..", ".env"), quiet: true });

const [{ StdioServerTransport }, { createServer }, { createConnections }] = await Promise.all([
  import("@modelcontextprotocol/sdk/server/stdio.js"),
  import("./server.js"),
  import("./solana/config.js"),
]);
const server = createServer(createConnections());
await server.connect(new StdioServerTransport());
// Keep a piped stdin in flowing mode while the MCP client is connected.
process.stdin.resume();
