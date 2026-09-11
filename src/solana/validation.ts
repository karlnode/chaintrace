import { PublicKey } from "@solana/web3.js";
import { ToolError } from "../shared/errors.js";

export function publicKey(value: string, label: string): PublicKey {
  try {
    return new PublicKey(value);
  } catch {
    throw new ToolError(`${label} must be a valid base58 Solana public key.`, "INVALID_PUBLIC_KEY");
  }
}

export function signature(value: string): string {
  if (!/^[1-9A-HJ-NP-Za-km-z]{64,128}$/.test(value)) {
    throw new ToolError("signature must be a valid base58 Solana transaction signature.", "INVALID_SIGNATURE");
  }
  return value;
}
