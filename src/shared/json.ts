/** Convert RPC values, BigInts, and Buffers to JSON-safe values without losing precision. */
export function jsonSafe(value: unknown): unknown {
  if (typeof value === "bigint") return value.toString();
  if (Buffer.isBuffer(value)) return value.toString("base64");
  if (Array.isArray(value)) return value.map(jsonSafe);
  if (value && typeof value === "object") {
    if ("toBase58" in value && typeof value.toBase58 === "function") {
      return value.toBase58();
    }
    const result: Record<string, unknown> = {};
    for (const [key, child] of Object.entries(value)) result[key] = jsonSafe(child);
    return result;
  }
  return value;
}

export function sol(lamports: number | bigint): string {
  return (Number(lamports) / 1_000_000_000).toString();
}

/** Convert a Solana Unix block time to an unambiguous ISO-8601 UTC timestamp. */
export function utcTime(unixSeconds: number | null | undefined): string | null {
  return unixSeconds == null ? null : new Date(unixSeconds * 1_000).toISOString();
}
