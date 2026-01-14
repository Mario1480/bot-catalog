import nacl from "tweetnacl";
import bs58 from "bs58";

// English comment: Verify an ed25519 signature over a UTF-8 message.
export function verifySignature(
  pubkeyBase58: string,
  signatureBase58: string,
  message: string
): boolean {
  const pubkey = bs58.decode(pubkeyBase58);
  const sig = bs58.decode(signatureBase58);
  const msg = new TextEncoder().encode(message);
  return nacl.sign.detached.verify(msg, sig, pubkey);
}