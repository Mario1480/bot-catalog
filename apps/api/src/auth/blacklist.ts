import { query } from "../db.js";

export type BlacklistEntry = {
  id: string;
  pubkey: string;
  reason: string;
};

export async function getBlacklistEntry(pubkey: string): Promise<BlacklistEntry | null> {
  const rows = await query<BlacklistEntry>(
    `SELECT id, pubkey, reason FROM wallet_blacklist WHERE pubkey = $1 LIMIT 1`,
    [pubkey]
  );
  return rows[0] || null;
}

export async function isWalletBlacklisted(pubkey: string): Promise<boolean> {
  const entry = await getBlacklistEntry(pubkey);
  return !!entry;
}
