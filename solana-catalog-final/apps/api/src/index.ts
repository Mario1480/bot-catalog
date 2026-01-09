import express from "express";
import cors from "cors";
import path from "path";
import fs from "fs";

import { env } from "./env.js";
import { initRedis } from "./redis.js";
import { makeNonce, upsertNonce, consumeNonce } from "./auth/nonce.js";
import { verifySignature } from "./auth/verify.js";
import { decideGate, getGateConfig } from "./gate/gate.js";
import { getUsdPriceFromCoinGecko } from "./gate/coingecko.js";
import { signUserJwt } from "./auth/jwt.js";

import { productsRouter } from "./products/products.routes.js";
import { adminRouter } from "./admin/admin.routes.js";

const app = express();

/**
 * CORS:
 * - supports "*" OR comma-separated origins in env.CORS_ORIGIN
 * - example: "https://app.utrade.vip,https://utrade.vip,http://localhost:3000"
 */
const allowedOrigins =
  env.CORS_ORIGIN === "*"
    ? ["*"]
    : String(env.CORS_ORIGIN || "")
        .split(",")
        .map((s) => s.trim())
        .filter(Boolean);

const corsOptions: cors.CorsOptions = {
  origin: (origin, cb) => {
    // allow server-to-server (curl) and same-origin
    if (!origin) return cb(null, true);

    // allow all
    if (allowedOrigins.includes("*")) return cb(null, true);

    const o = origin.replace(/\/$/, "");
    const ok = allowedOrigins.some((x) => x.replace(/\/$/, "") === o);

    // IMPORTANT: respond with a hard error so the browser blocks the call (instead of silently omitting headers)
    if (!ok) return cb(new Error("Not allowed by CORS"));

    return cb(null, true);
  },

  credentials: true,

  // Preflight must allow these headers (Authorization important!)
  allowedHeaders: ["Content-Type", "Authorization", "Accept"],
  methods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
};

app.use(cors(corsOptions));
app.options("*", cors(corsOptions));

/** ✅ THIS WAS MISSING */
app.use(express.json({ limit: "5mb" }));
app.use(express.urlencoded({ extended: true }));

// uploads
const uploadsDir = path.join(process.cwd(), "uploads");
if (!fs.existsSync(uploadsDir)) fs.mkdirSync(uploadsDir, { recursive: true });
app.use("/uploads", express.static(uploadsDir, { maxAge: "7d" }));

app.get("/health", (_req, res) => res.json({ ok: true }));

// Public gate preview (used by homepage to show token price + required amount)
async function handleGatePreview(_req: express.Request, res: express.Response) {
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

      // Optional price for display only
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
    return res.status(500).json({ error: e?.message || "Failed to load gate preview" });
  }
}

// Canonical
app.get("/gate-preview", handleGatePreview);
// Backward-compatible alias
app.get("/gate/preview", handleGatePreview);

// Wallet auth: nonce
app.get("/auth/nonce", async (req, res) => {
  const pubkey = String(req.query.pubkey ?? "");
  if (!pubkey) return res.status(400).json({ error: "Missing pubkey" });

  const nonce = makeNonce();
  await upsertNonce(pubkey, nonce, 10);

  const message = `Sign in uTrade Bot Catalog\n\nNonce: ${nonce}`;
  res.json({ nonce, message });
});

// Wallet auth: verify + gating
app.post("/auth/verify", async (req, res) => {
  const { pubkey, signature, message } = req.body ?? {};
  if (!pubkey || !signature || !message) {
    return res.status(400).json({ error: "Missing fields" });
  }

  const nonce = await consumeNonce(String(pubkey));
  if (!nonce) return res.status(401).json({ error: "Nonce expired or not found" });

  if (!String(message).includes(nonce)) {
    return res.status(401).json({ error: "Message does not include valid nonce" });
  }

  const ok = verifySignature(String(pubkey), String(signature), String(message));
  if (!ok) return res.status(401).json({ error: "Invalid signature" });

  const decision = await decideGate(String(pubkey));
  if (!decision.allowed) return res.status(403).json({ error: decision.reason, details: decision });

  const jwt = signUserJwt(String(pubkey));
  res.json({ token: jwt, details: decision });
});

// public gated
app.use("/products", productsRouter);

// admin
app.use("/admin", adminRouter);

(async () => {
  await initRedis();
  app.listen(env.PORT, () => console.log(`API listening on :${env.PORT}`));
})();
 