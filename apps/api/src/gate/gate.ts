import { query } from "../db.js";
import { getSplTokenBalanceUiAmount } from "./solana.js";
import { getUsdPriceFromCoinGecko } from "./coingecko.js";

export type GateDecision =
  | { allowed: true; reason: "OK"; balance: number; usdValue?: number; priceUsd?: number }
  | { allowed: false; reason: string; balance?: number; usdValue?: number; priceUsd?: number };

type GateConfigRow = {
  enabled: boolean;
  mint_address: string;
  min_amount: string | null;
  min_usd: string | null;
  tolerance_percent: string;
  coingecko_mode: "coin_id" | "onchain";
  coingecko_coin_id: string | null;
  coingecko_platform: string | null;
  coingecko_token_address: string | null;
};

export async function getGateConfig(): Promise<GateConfigRow> {
  const rows = await query<GateConfigRow>(`
    SELECT enabled, mint_address, min_amount, min_usd, tolerance_percent,
           coingecko_mode, coingecko_coin_id, coingecko_platform, coingecko_token_address
    FROM gate_config
    LIMIT 1
  `);
  return rows[0];
}

export async function decideGate(pubkey: string): Promise<GateDecision> {
  const cfg = await getGateConfig();

  if (!cfg?.enabled) return { allowed: true, reason: "OK", balance: 0 };
  if (!cfg.mint_address) return { allowed: false, reason: "Gate mint not configured" };

  const balance = await getSplTokenBalanceUiAmount(pubkey, cfg.mint_address);

  // English comment: If min_amount is set, use amount-only gating.
  if (cfg.min_amount !== null) {
    const minAmount = Number(cfg.min_amount);
    if (balance >= minAmount) return { allowed: true, reason: "OK", balance };
    return { allowed: false, reason: "Insufficient token amount", balance };
  }

  // English comment: USD-based gating requires min_usd and a price source.
  if (cfg.min_usd === null) return { allowed: false, reason: "Gate thresholds not configured" };

  const requiredUsd = Number(cfg.min_usd);
  const tol = Number(cfg.tolerance_percent) / 100;

  const priceUsd = await getUsdPriceFromCoinGecko({
    mode: cfg.coingecko_mode,
    coinId: cfg.coingecko_coin_id,
    platform: cfg.coingecko_platform || "solana",
    tokenAddress: (cfg.coingecko_token_address || cfg.mint_address || "").trim()
  });

  const usdValue = balance * priceUsd;

  // English comment: Hysteresis using stored last_status prevents flapping around the threshold.
  const stateRows = await query<{ last_status: boolean }>(
    `SELECT last_status FROM gate_state WHERE pubkey = $1`,
    [pubkey]
  );
  const lastStatus = stateRows[0]?.last_status ?? false;

  const unlockThreshold = requiredUsd * (1 + tol);
  const lockThreshold = requiredUsd * (1 - tol);

  const allowed = lastStatus ? usdValue >= lockThreshold : usdValue >= unlockThreshold;

  await query(
    `
    INSERT INTO gate_state (pubkey, last_status, last_value_usd, updated_at)
    VALUES ($1, $2, $3, now())
    ON CONFLICT (pubkey) DO UPDATE
      SET last_status = EXCLUDED.last_status,
          last_value_usd = EXCLUDED.last_value_usd,
          updated_at = now()
    `,
    [pubkey, allowed, usdValue]
  );

  if (allowed) return { allowed: true, reason: "OK", balance, usdValue, priceUsd };
  return { allowed: false, reason: "Insufficient USD value", balance, usdValue, priceUsd };
}