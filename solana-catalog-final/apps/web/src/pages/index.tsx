import express from "express";
import cors from "cors";
import { getGateConfig } from "./gate/gate.js";
import { getUsdPriceFromCoinGecko } from "./gate/coingecko.js";

const app = express();

app.use(cors());
app.use(express.json());

app.get("/health", (_req, res) => res.json({ ok: true }));

// Public gate preview (used by homepage to show token price + required amount)
app.get("/gate/preview", async (_req, res) => {
  try {
    const cfg = await getGateConfig();
    if (!cfg) return res.status(500).json({ error: "gate_config not initialized" });

    const enabled = !!cfg.enabled;
    const mode = cfg.min_amount !== null ? "amount" : cfg.min_usd !== null ? "usd" : "none";

    let priceUsd: number | null = null;
    let requiredTokens: number | null = null;
    let requiredUsd: number | null = null;

    async function fetchPrice(): Promise<number> {
      return await getUsdPriceFromCoinGecko({
        mode: cfg.coingecko_mode,
        coinId: cfg.coingecko_coin_id,
        platform: cfg.coingecko_platform || "solana",
        tokenAddress: (cfg.coingecko_token_address || cfg.mint_address || "").trim(),
      });
    }

    if (mode === "usd") {
      priceUsd = await fetchPrice();
      requiredUsd = Number(cfg.min_usd);
      if (Number.isFinite(requiredUsd) && priceUsd > 0) requiredTokens = requiredUsd / priceUsd;
    } else if (mode === "amount") {
      requiredTokens = Number(cfg.min_amount);
      if (!Number.isFinite(requiredTokens)) requiredTokens = null;
      try {
        priceUsd = await fetchPrice();
        if (priceUsd > 0 && requiredTokens !== null) requiredUsd = requiredTokens * priceUsd;
      } catch {
        // ignore
      }
    }

    return res.json({
      enabled,
      mode,
      mint_address: cfg.mint_address || "",
      min_amount: cfg.min_amount !== null ? Number(cfg.min_amount) : null,
      min_usd: cfg.min_usd !== null ? Number(cfg.min_usd) : null,
      tolerance_percent: Number(cfg.tolerance_percent ?? 2),
      priceUsd,
      requiredUsd,
      requiredTokens,
    });
  } catch (e: any) {
    return res.status(500).json({ error: e?.message || "Failed" });
  }
});