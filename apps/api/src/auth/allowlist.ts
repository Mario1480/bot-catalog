import { query } from "../db.js";

export type AllowlistEntry = {
  id: string;
  pubkey: string;
  reason: string;
};

export async function getAllowlistEntry(pubkey: string): Promise<AllowlistEntry | null> {
  const rows = await query<AllowlistEntry>(
    `SELECT id, pubkey, reason FROM wallet_allowlist WHERE pubkey = $1 LIMIT 1`,
    [pubkey]
  );
  return rows[0] || null;
}

export async function isWalletAllowlisted(pubkey: string): Promise<boolean> {
  const entry = await getAllowlistEntry(pubkey);
  return !!entry;
}
