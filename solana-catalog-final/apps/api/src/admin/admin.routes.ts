// apps/api/src/admin/admin.routes.ts
import { Router } from "express";
import bcrypt from "bcryptjs";
import multer from "multer";
import path from "path";
import fs from "fs";
import crypto from "crypto";
import { redis } from "../redis.js";

import { query } from "../db.js";
import { signAdminJwt } from "../auth/jwt.js";
import { requireAdmin } from "../auth/adminAuth.js";

import { categoriesRouter } from "../categories/categories.routes.js";
import { getGateConfig } from "../gate/gate.js";
import { getUsdPriceFromCoinGecko } from "../gate/coingecko.js";

import {
  exportProductsCsvSemicolon,
  importProductsCsvSemicolon,
} from "./productsCsv.js";

export const adminRouter = Router();

const upload = multer();

/* ------------------ UPLOAD IMAGE ------------------ */
const uploadImage = multer({
  limits: { fileSize: 2 * 1024 * 1024 }, // 2MB
  fileFilter: (_req, file, cb) => {
    const ok = ["image/jpeg", "image/png", "image/webp"].includes(file.mimetype);
    // Multer callback typing differs across versions; keep it permissive to avoid TS build errors.
    const done = cb as unknown as (error: any, acceptFile: boolean) => void;
    done(ok ? null : new Error("Invalid image type"), ok);
  },
});

function ensureUploadsDir(): string {
  const dir = path.join(process.cwd(), "uploads");
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  return dir;
}

type FieldKV = { key: string; value: string };

function cleanFields(input: any): FieldKV[] {
  return (Array.isArray(input) ? input : [])
    .map((f) => ({
      key: String(f?.key ?? "").trim(),
      value: String(f?.value ?? "").trim(),
    }))
    .filter((f) => f.key && f.value);
}

function cleanTags(input: any): string[] {
  return (Array.isArray(input) ? input : [])
    .map((t) => String(t).trim())
    .filter(Boolean);
}

function buildSearchExtra(fields: FieldKV[], tags: string[]): string {
  const parts: string[] = [];
  for (const f of fields) {
    parts.push(f.key, f.value);
  }
  for (const t of tags) parts.push(t);
  return parts.join(" ").slice(0, 5000);
}

/* ------------------ AUTH ------------------ */
adminRouter.post("/login", async (req, res) => {
  const email = String(req.body?.email ?? "").trim().toLowerCase();
  const password = String(req.body?.password ?? "");
  if (!email || !password) return res.status(400).json({ error: "Missing credentials" });

  const rows = await query<{ id: string; email: string; password_hash: string }>(
    `SELECT id, email, password_hash FROM admins WHERE email = $1`,
    [email]
  );

  const admin = rows[0];
  if (!admin) return res.status(401).json({ error: "Invalid credentials" });

  const ok = await bcrypt.compare(password, admin.password_hash);
  if (!ok) return res.status(401).json({ error: "Invalid credentials" });

  res.json({ token: signAdminJwt(admin.id, admin.email) });
});

/* ------------------ GATE CONFIG ------------------ */
adminRouter.get("/gate-config", requireAdmin, async (_req, res) => {
  const rows = await query<any>(`SELECT * FROM gate_config LIMIT 1`);
  res.json(rows[0]);
});

adminRouter.put("/gate-config", requireAdmin, async (req, res) => {
  const {
    enabled,
    mint_address,
    min_amount,
    min_usd,
    tolerance_percent,
    coingecko_mode,
    coingecko_coin_id,
    coingecko_platform,
    coingecko_token_address,
  } = req.body ?? {};

  const minAmountVal =
    min_amount === "" || min_amount === null || min_amount === undefined ? null : Number(min_amount);
  const minUsdVal =
    min_usd === "" || min_usd === null || min_usd === undefined ? null : Number(min_usd);

  if (Number.isNaN(minAmountVal as any) || Number.isNaN(minUsdVal as any)) {
    return res.status(400).json({ error: "min_amount/min_usd must be a number" });
  }

  if (minAmountVal !== null && minUsdVal !== null) {
    return res.status(400).json({ error: "Set either min_amount or min_usd, not both" });
  }

  await query(
    `
    UPDATE gate_config
    SET enabled = $1,
        mint_address = $2,
        min_amount = $3,
        min_usd = $4,
        tolerance_percent = $5,
        coingecko_mode = $6,
        coingecko_coin_id = $7,
        coingecko_platform = $8,
        coingecko_token_address = $9,
        updated_at = now()
    `,
    [
      Boolean(enabled),
      String(mint_address ?? ""),
      minAmountVal,
      minUsdVal,
      Number(tolerance_percent ?? 2),
      String(coingecko_mode ?? "coin_id"),
      coingecko_coin_id ? String(coingecko_coin_id) : null,
      coingecko_platform ? String(coingecko_platform) : null,
      coingecko_token_address ? String(coingecko_token_address) : null,
    ]
  );

  const rows = await query<any>(`SELECT * FROM gate_config LIMIT 1`);
  res.json(rows[0]);
});

// GET /admin/gate-preview
adminRouter.get("/gate-preview", requireAdmin, async (_req, res) => {
  const cfg = await getGateConfig();
  if (!cfg) return res.status(500).json({ error: "gate_config not initialized" });

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

  try {
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
        // ignore price errors in amount-mode
      }
    }
  } catch (e: any) {
    if (mode === "usd") return res.status(500).json({ error: e?.message || "Failed to fetch price" });
  }

  res.json({
    enabled: !!cfg.enabled,
    mode,
    mint_address: cfg.mint_address || "",
    min_amount: cfg.min_amount !== null ? Number(cfg.min_amount) : null,
    min_usd: cfg.min_usd !== null ? Number(cfg.min_usd) : null,
    tolerance_percent: Number(cfg.tolerance_percent ?? 2),
    priceUsd,
    requiredUsd,
    requiredTokens,
  });
});

/* ------------------ HEALTH / STATUS ------------------ */
adminRouter.get("/status", requireAdmin, async (_req, res) => {
  let dbOk = false;
  let redisOk = false;

  try {
    await query("SELECT 1 as ok");
    dbOk = true;
  } catch {
    dbOk = false;
  }

  try {
    const pong = await (redis as any).ping?.();
    redisOk = pong === "PONG" || !!pong;
  } catch {
    redisOk = false;
  }

  res.json({
    now: new Date().toISOString(),
    node: process.version,
    uptimeSec: Math.floor(process.uptime()),
    dbOk,
    redisOk,
  });
});

/* ------------------ WALLET BLACKLIST ------------------ */
adminRouter.get("/blacklist", requireAdmin, async (req, res) => {
  const search = typeof req.query.search === "string" ? req.query.search.trim() : "";
  const values: any[] = [];
  const where: string[] = ["1=1"];

  if (search) {
    values.push(`%${search}%`);
    where.push(`(pubkey ILIKE $${values.length} OR reason ILIKE $${values.length})`);
  }

  const rows = await query<any>(
    `
    SELECT id, pubkey, reason, created_at, updated_at
    FROM wallet_blacklist
    WHERE ${where.join(" AND ")}
    ORDER BY created_at DESC
    `,
    values
  );

  res.json(rows);
});

adminRouter.post("/blacklist", requireAdmin, async (req, res) => {
  const pubkey = String(req.body?.pubkey ?? "").trim();
  const reason = String(req.body?.reason ?? "").trim();
  if (!pubkey) return res.status(400).json({ error: "pubkey is required" });

  const rows = await query<any>(
    `
    INSERT INTO wallet_blacklist (pubkey, reason)
    VALUES ($1, $2)
    ON CONFLICT (pubkey)
    DO UPDATE SET reason = EXCLUDED.reason, updated_at = now()
    RETURNING id, pubkey, reason, created_at, updated_at
    `,
    [pubkey, reason]
  );

  res.json(rows[0]);
});

adminRouter.delete("/blacklist/:id([0-9a-fA-F-]{36})", requireAdmin, async (req, res) => {
  const id = String(req.params.id || "");
  if (!id) return res.status(400).json({ error: "Missing id" });

  const rows = await query<any>(`DELETE FROM wallet_blacklist WHERE id = $1 RETURNING id`, [id]);
  if (!rows[0]) return res.status(404).json({ error: "Not found" });

  res.json({ ok: true });
});

/* ------------------ USER ANALYTICS (Redis counters) ------------------ */
adminRouter.get("/user-analytics", requireAdmin, async (_req, res) => {
  async function safeGet(key: string): Promise<number> {
    try {
      const v = await (redis as any).get?.(key);
      return Number(v || 0);
    } catch {
      return 0;
    }
  }

  async function safeScard(key: string): Promise<number> {
    try {
      const v = await (redis as any).scard?.(key);
      return Number(v || 0);
    } catch {
      return 0;
    }
  }

  async function readWindow(prefix: string) {
    const [attempts, allowed, blocked, uniqueWallets] = await Promise.all([
      safeGet(`${prefix}:attempts`),
      safeGet(`${prefix}:allowed`),
      safeGet(`${prefix}:blocked`),
      safeScard(`${prefix}:wallets`),
    ]);

    return { attempts, allowed, blocked, uniqueWallets };
  }

  const [d1, d7, d30] = await Promise.all([
    readWindow("ua:d1"),
    readWindow("ua:d7"),
    readWindow("ua:d30"),
  ]);

  res.json({ d1, d7, d30 });
});

/* ------------------ PRODUCTS STATS (Dashboard) ------------------ */
adminRouter.get("/products/stats", requireAdmin, async (_req, res) => {
  const rows = await query<any>(
    `
    SELECT
      COUNT(*)::int AS total,
      COUNT(*) FILTER (WHERE status = 'published')::int AS published,
      COUNT(*) FILTER (WHERE status = 'draft')::int AS draft,
      MAX(updated_at) AS last_updated
    FROM products
    `
  );

  const r = rows[0] || { total: 0, published: 0, draft: 0, last_updated: null };
  res.json({
    total: Number(r.total || 0),
    published: Number(r.published || 0),
    draft: Number(r.draft || 0),
    lastUpdated: r.last_updated ? new Date(r.last_updated).toISOString() : null,
  });
});

/* ------------------ UPLOADS ------------------ */
adminRouter.post("/uploads/image", requireAdmin, uploadImage.single("file"), async (req, res) => {
  if (!req.file) return res.status(400).json({ error: "Missing file" });

  const ext =
    req.file.mimetype === "image/png"
      ? ".png"
      : req.file.mimetype === "image/webp"
        ? ".webp"
        : ".jpg";

  const name = `${Date.now()}-${crypto.randomBytes(8).toString("hex")}${ext}`;
  fs.writeFileSync(path.join(ensureUploadsDir(), name), req.file.buffer);
  res.json({ publicUrl: `/uploads/${name}` });
});

/* ------------------ CATEGORIES (Admin) ------------------ */
adminRouter.use("/categories", requireAdmin, categoriesRouter);

/* ------------------ PRODUCTS LIST ------------------ */
adminRouter.get("/products", requireAdmin, async (req, res) => {
  const search = typeof req.query.search === "string" ? req.query.search.trim() : "";
  const page = req.query.page ? Number(req.query.page) : 1;
  const pageSize = req.query.pageSize ? Math.min(50, Number(req.query.pageSize)) : 20;
  const offset = (Math.max(1, page) - 1) * pageSize;

  const values: any[] = [];
  const where: string[] = ["1=1"];

  if (search) {
    values.push(`%${search}%`);
    where.push(`(p.title ILIKE $${values.length} OR p.search_extra ILIKE $${values.length})`);
  }

  values.push(pageSize, offset);

  const rows = await query<any>(
    `
    SELECT p.id, p.title, p.status, p.target_url, p.updated_at
    FROM products p
    WHERE ${where.join(" AND ")}
    ORDER BY p.updated_at DESC
    LIMIT $${values.length - 1} OFFSET $${values.length}
    `,
    values
  );

  res.json(rows);
});

/* ------------------ CSV IMPORT / EXPORT ------------------ */
// IMPORTANT: Must be defined BEFORE /products/:id
adminRouter.post("/products/import-csv", requireAdmin, upload.single("file"), async (req, res) => {
  if (!req.file?.buffer) return res.status(400).json({ error: "Missing file" });
  res.json(await importProductsCsvSemicolon(req.file.buffer));
});

adminRouter.get("/products/export-csv", requireAdmin, async (_req, res) => {
  const csv = await exportProductsCsvSemicolon();
  res.setHeader("Content-Type", "text/csv; charset=utf-8");
  res.setHeader("Content-Disposition", "attachment; filename=products_export.csv");
  res.send(csv);
});

/* ------------------ PRODUCTS CRUD ------------------ */
adminRouter.get("/products/:id([0-9a-fA-F-]{36})", requireAdmin, async (req, res) => {
  const id = String(req.params.id || "");
  const p = (await query<any>(`SELECT * FROM products WHERE id = $1`, [id]))[0];
  if (!p) return res.status(404).json({ error: "Not found" });

  const fields = await query<any>(
    `SELECT key, value FROM product_fields WHERE product_id = $1 ORDER BY key`,
    [id]
  );
  const tags = await query<any>(
    `SELECT tag FROM product_tags WHERE product_id = $1 ORDER BY tag`,
    [id]
  );

  res.json({ ...p, fields, tags: tags.map((t: any) => t.tag) });
});

adminRouter.post("/products", requireAdmin, async (req, res) => {
  const { title, description, image_url, target_url, status, fields, tags } = req.body ?? {};
  if (!title || !target_url) {
    return res.status(400).json({ error: "title and target_url are required" });
  }

  const fieldsList = cleanFields(fields);
  const tagList = cleanTags(tags);
  const searchExtra = buildSearchExtra(fieldsList, tagList);

  const rows = await query<{ id: string }>(
    `
    INSERT INTO products (title, description, image_url, target_url, status, search_extra)
    VALUES ($1,$2,$3,$4,$5,$6)
    RETURNING id
    `,
    [
      String(title),
      String(description ?? ""),
      String(image_url ?? ""),
      String(target_url),
      String(status ?? "published"),
      searchExtra,
    ]
  );

  const id = rows[0].id;

  for (const f of fieldsList) {
    await query(`INSERT INTO product_fields (product_id, key, value) VALUES ($1,$2,$3)`, [
      id,
      f.key,
      f.value,
    ]);
  }
  for (const t of tagList) {
    await query(`INSERT INTO product_tags (product_id, tag) VALUES ($1,$2)`, [id, t]);
  }

  res.json({ id });
});

adminRouter.put("/products/:id([0-9a-fA-F-]{36})", requireAdmin, async (req, res) => {
  const id = String(req.params.id || "");
  const { title, description, image_url, target_url, status, fields, tags } = req.body ?? {};
  if (!title || !target_url) {
    return res.status(400).json({ error: "title and target_url are required" });
  }

  const fieldsList = cleanFields(fields);
  const tagList = cleanTags(tags);
  const searchExtra = buildSearchExtra(fieldsList, tagList);

  await query(
    `
    UPDATE products
    SET title=$1, description=$2, image_url=$3, target_url=$4, status=$5, search_extra=$6, updated_at=now()
    WHERE id=$7
    `,
    [
      String(title),
      String(description ?? ""),
      String(image_url ?? ""),
      String(target_url),
      String(status ?? "published"),
      searchExtra,
      id,
    ]
  );

  await query(`DELETE FROM product_fields WHERE product_id = $1`, [id]);
  await query(`DELETE FROM product_tags WHERE product_id = $1`, [id]);

  for (const f of fieldsList) {
    await query(`INSERT INTO product_fields (product_id, key, value) VALUES ($1,$2,$3)`, [
      id,
      f.key,
      f.value,
    ]);
  }
  for (const t of tagList) {
    await query(`INSERT INTO product_tags (product_id, tag) VALUES ($1,$2)`, [id, t]);
  }

  res.json({ ok: true });
});

adminRouter.delete("/products/:id([0-9a-fA-F-]{36})", requireAdmin, async (req, res) => {
  const id = String(req.params.id || "");
  await query(`DELETE FROM product_fields WHERE product_id = $1`, [id]);
  await query(`DELETE FROM product_tags WHERE product_id = $1`, [id]);
  await query(`DELETE FROM products WHERE id = $1`, [id]);
  res.json({ ok: true });
});

/* ------------------ ADMINS CRUD ------------------ */
adminRouter.get("/admins", requireAdmin, async (_req, res) => {
  const rows = await query<any>(
    `SELECT id, email, created_at, updated_at FROM admins ORDER BY created_at DESC`
  );
  res.json(rows);
});

adminRouter.post("/admins", requireAdmin, async (req, res) => {
  const email = String(req.body?.email ?? "").trim().toLowerCase();
  const password = String(req.body?.password ?? "");

  if (!email || !password) return res.status(400).json({ error: "email and password are required" });
  if (password.length < 8) return res.status(400).json({ error: "password must be at least 8 characters" });

  const existing = await query<any>(`SELECT id FROM admins WHERE email = $1`, [email]);
  if (existing[0]) return res.status(409).json({ error: "Admin already exists" });

  const hash = await bcrypt.hash(password, 10);
  const rows = await query<any>(
    `
    INSERT INTO admins (email, password_hash)
    VALUES ($1,$2)
    RETURNING id,email,created_at,updated_at
    `,
    [email, hash]
  );
  res.json(rows[0]);
});

// Reset password
adminRouter.put("/admins/:id([0-9a-fA-F-]{36})", requireAdmin, async (req: any, res) => {
  const id = String(req.params.id || "");
  const password = String(req.body?.password ?? "");

  if (!id) return res.status(400).json({ error: "Missing id" });
  if (!password) return res.status(400).json({ error: "password is required" });
  if (password.length < 8) return res.status(400).json({ error: "password must be at least 8 characters" });

  const hash = await bcrypt.hash(password, 10);
  const rows = await query<any>(
    `
    UPDATE admins
    SET password_hash = $2, updated_at = now()
    WHERE id = $1
    RETURNING id,email,created_at,updated_at
    `,
    [id, hash]
  );

  if (!rows[0]) return res.status(404).json({ error: "Not found" });
  res.json(rows[0]);
});

adminRouter.delete("/admins/:id([0-9a-fA-F-]{36})", requireAdmin, async (req: any, res) => {
  const id = String(req.params.id || "");
  if (!id) return res.status(400).json({ error: "Missing id" });

  // prevent self delete if requireAdmin attaches admin object
  const meId = String((req as any).admin?.id || "");
  if (meId && meId === id) return res.status(400).json({ error: "You cannot delete your own admin account" });

  const rows = await query<any>(`DELETE FROM admins WHERE id = $1 RETURNING id`, [id]);
  if (!rows[0]) return res.status(404).json({ error: "Not found" });

  res.json({ ok: true });
});
