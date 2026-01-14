import { Connection, PublicKey } from "@solana/web3.js";
import { env } from "../env.js";

const conn = new Connection(env.SOLANA_RPC_URL, "confirmed");

export async function getSplTokenBalanceUiAmount(
  ownerPubkey: string,
  mintAddress: string
): Promise<number> {
  // English comment: Reads SPL token accounts for owner and sums uiAmount for the given mint.
  const owner = new PublicKey(ownerPubkey);
  const mint = new PublicKey(mintAddress);

  const res = await conn.getParsedTokenAccountsByOwner(owner, { mint });
  let total = 0;

  for (const acc of res.value) {
    const info: any = acc.account.data.parsed.info;
    const uiAmount = info.tokenAmount?.uiAmount ?? 0;
    total += Number(uiAmount);
  }

  return total;
}