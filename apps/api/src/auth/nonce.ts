import { query } from "../db.js";

export function makeNonce() {
  // English comment: A simple random nonce.
  return `${Date.now()}-${Math.random().toString(16).slice(2)}-${Math.random()
    .toString(16)
    .slice(2)}`;
}

export async function upsertNonce(pubkey: string, nonce: string, ttlMinutes = 10) {
  await query(
    `
    INSERT INTO auth_nonces (pubkey, nonce, expires_at)
    VALUES ($1, $2, now() + ($3 || ' minutes')::interval)
    ON CONFLICT (pubkey) DO UPDATE SET nonce = EXCLUDED.nonce, expires_at = EXCLUDED.expires_at
    `,
    [pubkey, nonce, ttlMinutes.toString()]
  );
}

export async function consumeNonce(pubkey: string): Promise<string | null> {
  const rows = await query<{ nonce: string; expires_at: string }>(
    `SELECT nonce, expires_at FROM auth_nonces WHERE pubkey = $1`,
    [pubkey]
  );
  if (!rows[0]) return null;

  const exp = new Date(rows[0].expires_at).getTime();
  if (Date.now() > exp) return null;

  // English comment: Remove nonce after use.
  await query(`DELETE FROM auth_nonces WHERE pubkey = $1`, [pubkey]);
  return rows[0].nonce;
}