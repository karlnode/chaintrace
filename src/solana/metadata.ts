import { PublicKey } from "@solana/web3.js";

export const TOKEN_METADATA_PROGRAM_ID = new PublicKey("metaqbxxUerdq28cj1RbAWkYQm3ybzjb6a8bt518x1s");

export interface OnChainTokenMetadata {
  address: string;
  updateAuthority: string;
  name: string;
  symbol: string;
  uri: string;
  sellerFeeBasisPoints: number;
}

export function metadataAddress(mint: PublicKey): PublicKey {
  return PublicKey.findProgramAddressSync(
    [Buffer.from("metadata"), TOKEN_METADATA_PROGRAM_ID.toBuffer(), mint.toBuffer()],
    TOKEN_METADATA_PROGRAM_ID,
  )[0];
}

function readString(data: Buffer, offset: number): [string, number] {
  const length = data.readUInt32LE(offset);
  const start = offset + 4;
  return [data.subarray(start, start + length).toString("utf8").replace(/\0+$/g, ""), start + length];
}

/** Decode the stable leading fields of a Metaplex Metadata account. */
export function decodeMetadata(data: Buffer, address: PublicKey): OnChainTokenMetadata {
  if (data.length < 65) throw new Error("Metadata account is too short.");
  let offset = 65; // key (1), update authority (32), mint (32)
  const [name, afterName] = readString(data, offset);
  const [symbol, afterSymbol] = readString(data, afterName);
  const [uri, afterUri] = readString(data, afterSymbol);
  if (afterUri + 2 > data.length) throw new Error("Metadata account is truncated.");
  return {
    address: address.toBase58(),
    updateAuthority: new PublicKey(data.subarray(1, 33)).toBase58(),
    name,
    symbol,
    uri,
    sellerFeeBasisPoints: data.readUInt16LE(afterUri),
  };
}
