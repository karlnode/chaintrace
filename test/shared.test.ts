import { describe, expect, it } from "vitest";
import { PublicKey } from "@solana/web3.js";
import { ToolError, asToolError } from "../src/shared/errors.js";
import { jsonSafe, sol, utcTime } from "../src/shared/json.js";
import { decodeMetadata, metadataAddress } from "../src/solana/metadata.js";
import { publicKey, signature } from "../src/solana/validation.js";

describe("shared Solana utilities", () => {
  it("serializes bigint, buffer, and public key without precision loss", () => {
    const key = new PublicKey("11111111111111111111111111111111");
    expect(jsonSafe({ value: 123n, bytes: Buffer.from("test"), key })).toEqual({
      value: "123", bytes: "dGVzdA==", key: key.toBase58(),
    });
    expect(sol(1_500_000_000)).toBe("1.5");
    expect(utcTime(1_700_000_000)).toBe("2023-11-14T22:13:20.000Z");
    expect(utcTime(null)).toBeNull();
  });

  it("validates public keys and signatures", () => {
    expect(() => publicKey("bad", "address")).toThrow(ToolError);
    expect(() => signature("bad")).toThrow("valid base58");
  });

  it("derives and decodes Metaplex metadata leading fields", () => {
    const mint = new PublicKey("11111111111111111111111111111111");
    const write = (value: string) => {
      const body = Buffer.from(value);
      const length = Buffer.alloc(4); length.writeUInt32LE(body.length);
      return Buffer.concat([length, body]);
    };
    const bytes = Buffer.concat([
      Buffer.from([4]), new PublicKey("11111111111111111111111111111111").toBuffer(), mint.toBuffer(),
      write("Chaintrace"), write("TRACE"), write("https://example.test/token.json"), Buffer.from([0, 0]),
    ]);
    const result = decodeMetadata(bytes, metadataAddress(mint));
    expect(result).toMatchObject({ name: "Chaintrace", symbol: "TRACE", uri: "https://example.test/token.json" });
  });

  it("preserves tool errors and converts unexpected RPC errors", () => {
    const original = new ToolError("missing", "MISSING");
    expect(asToolError(original)).toBe(original);
    expect(asToolError(new Error("timeout"))).toMatchObject({ code: "RPC_ERROR", message: "Solana RPC request failed: timeout" });
  });
});
