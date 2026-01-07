import express from "express";
import cors from "cors";
import path from "path";
import fs from "fs";

import { env } from "./env.js";
import { initRedis } from "./redis.js";
import { makeNonce, upsertNonce, consumeNonce } from "./auth/nonce.js";
import { verifySignature } from "./auth/verify.js";
import { decideGate } from "./gate/gate.js";
import { signUserJwt } from "./auth/jwt.js";

import { productsRouter } from "./products/products.routes.js";
import { adminRouter } from "./admin/admin.routes.js";
import { categoriesRouter } from "./categories/categories.routes.js"; // ✅ NEW

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

app.use(
  cors({
    origin: (origin, cb) => {
      // allow server-to-server (curl) and same-origin
      if (!origin) return cb(null, true);

      // allow all
      if (allowedOrigins.includes("*")) return cb(null, true);

      const o = origin.replace(/\/$/, "");
      const ok = allowedOrigins.some((x) => x.replace(/\/$/, "") === o);

      if (ok) return cb(null, true);

      // block otherwise
      return cb(null, false);
    },
    credentials: true,
  })
);

// helpful for preflight
app.options("*", cors());

app.use(express.json({ limit: "5mb" }));

// Ensure uploads directory exists and is served publicly.
const uploadsDir = path.join(process.cwd(), "uploads");
if (!fs.existsSync(uploadsDir)) fs.mkdirSync(uploadsDir, { recursive: true });
app.use("/uploads", express.static(uploadsDir, { maxAge: "7d" }));

app.get("/health", (_req, res) => res.json({ ok: true }));

// Wallet auth: nonce
app.get("/auth/nonce", async (req, res) => {
  const pubkey = String(req.query.pubkey ?? "");
  if (!pubkey) return res.status(400).json({ error: "Missing pubkey" });

  const nonce = makeNonce();
  await upsertNonce(pubkey, nonce, 10);

  const message = `Sign in to Solana Catalog\n\nNonce: ${nonce}`;
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

// Gated catalog endpoints
app.use("/products", productsRouter);

// ✅ Admin: Categories endpoints (MUST be before /admin router)
app.use("/admin/categories", categoriesRouter);

// Admin endpoints
app.use("/admin", adminRouter);

(async () => {
  await initRedis();
  app.listen(env.PORT, () => console.log(`API listening on :${env.PORT}`));
})();