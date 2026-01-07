// apps/api/src/admin/admin.routes.ts
import { Router } from "express";
import bcrypt from "bcryptjs";
import multer from "multer";
import path from "path";
import fs from "fs";
import crypto from "crypto";

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
  limits: { fileSize: 2 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    const ok = ["image/jpeg", "image/png", "image/webp"].includes(file.mimetype);
    cb(ok ? null : new Error("Invalid image type"), ok);
  },
});

function ensureUploadsDir(): string {
  const dir = path.join(process.cwd(), "uploads");
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  return dir;
}

/* ------------------ HELPERS ------------------ */
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
  return [...fields.flatMap((f) => [f.key, f.value]), ...tags].join(" ").slice(0, 5000);
}

/* ------------------ AUTH ------------------ */
adminRouter.post("/login", async (req, res) => {
  const email = String(req.body?.email ?? "").trim().toLowerCase();
  const password = String(req.body?.password ?? "");
  if (!email || !password) return res.status(400).json({ error: "Missing credentials" });

  const rows = await query<any>(
    `SELECT id, email, password_hash FROM admins WHERE email = $1`,
    [email]
  );
  const admin = rows[0];
  if (!admin || !(await bcrypt.compare(password, admin.password_hash))) {
    return res.status(401).json({ error: "Invalid credentials" });
  }

  res.json({ token: signAdminJwt(admin.id, admin.email) });
});

/* ------------------ GATE CONFIG ------------------ */
adminRouter.get("/gate-config", requireAdmin, async (_req, res) => {
  const rows = await query<any>(`SELECT * FROM gate_config LIMIT 1`);
  res.json(rows[0]);
});

adminRouter.put("/gate-config", requireAdmin, async (req, res) => {
  const cfg = req.body ?? {};
  await query(
    `
    UPDATE gate_config
    SET enabled=$1, mint_address=$2, min_amount=$3, min_usd=$4,
        tolerance_percent=$5, coingecko_mode=$6, coingecko_coin_id=$7,
        coingecko_platform=$8, coingecko_token_address=$9, updated_at=now()
    `,
    [
      !!cfg.enabled,
      cfg.mint_address ?? "",
      cfg.min_amount ?? null,
      cfg.min_usd ?? null,
      cfg.tolerance_percent ?? 2,
      cfg.coingecko_mode ?? "coin_id",
      cfg.coingecko_coin_id ?? null,
      cfg.coingecko_platform ?? null,
      cfg.coingecko_token_address ?? null,
    ]
  );
  const rows = await query<any>(`SELECT * FROM gate_config LIMIT 1`);
  res.json(rows[0]);
});

/* ------------------ GATE PREVIEW ------------------ */
adminRouter.get("/gate-preview", requireAdmin, async (_req, res) => {
  const cfg = await getGateConfig();
  if (!cfg) return res.status(500).json({ error: "gate_config missing" });

  let priceUsd: number | null = null;
  let requiredTokens: number | null = null;
  let requiredUsd: number | null = null;

  const fetchPrice = () =>
    getUsdPriceFromCoinGecko({
      mode: cfg.coingecko_mode,
      coinId: cfg.coingecko_coin_id,
      platform: cfg.coingecko_platform || "solana",
      tokenAddress: cfg.coingecko_token_address || cfg.mint_address || "",
    });

  if (cfg.min_usd) {
    priceUsd = await fetchPrice();
    requiredUsd = Number(cfg.min_usd);
    requiredTokens = priceUsd > 0 ? requiredUsd / priceUsd : null;
  } else if (cfg.min_amount) {
    requiredTokens = Number(cfg.min_amount);
    try {
      priceUsd = await fetchPrice();
      requiredUsd = priceUsd ? requiredTokens * priceUsd : null;
    } catch {}
  }

  res.json({
    enabled: !!cfg.enabled,
    mode: cfg.min_usd ? "usd" : cfg.min_amount ? "amount" : "none",
    priceUsd,
    requiredUsd,
    requiredTokens,
  });
});

/* ------------------ UPLOAD IMAGE ------------------ */
adminRouter.post("/uploads/image", requireAdmin, uploadImage.single("file"), async (req, res) => {
  if (!req.file) return res.status(400).json({ error: "Missing file" });
  const ext = req.file.mimetype === "image/png" ? ".png" : ".jpg";
  const name = `${Date.now()}-${crypto.randomBytes(8).toString("hex")}${ext}`;
  fs.writeFileSync(path.join(ensureUploadsDir(), name), req.file.buffer);
  res.json({ publicUrl: `/uploads/${name}` });
});

/* ------------------ CATEGORIES ------------------ */
adminRouter.use("/categories", requireAdmin, categoriesRouter);

/* ------------------ PRODUCTS LIST ------------------ */
adminRouter.get("/products", requireAdmin, async (req, res) => {
  const rows = await query<any>(
    `SELECT id, title, status, target_url, updated_at FROM products ORDER BY updated_at DESC`
  );
  res.json(rows);
});

/* ------------------ CSV IMPORT / EXPORT ------------------ */
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
adminRouter.get("/products/:id", requireAdmin, async (req, res) => {
  const p = (await query<any>(`SELECT * FROM products WHERE id=$1`, [req.params.id]))[0];
  if (!p) return res.status(404).json({ error: "Not found" });

  const fields = await query<any>(
    `SELECT key, value FROM product_fields WHERE product_id=$1`,
    [p.id]
  );
  const tags = await query<any>(
    `SELECT tag FROM product_tags WHERE product_id=$1`,
    [p.id]
  );

  res.json({ ...p, fields, tags: tags.map((t) => t.tag) });
});

adminRouter.post("/products", requireAdmin, async (req, res) => {
  const { title, target_url } = req.body ?? {};
  if (!title || !target_url) return res.status(400).json({ error: "Missing fields" });

  const fields = cleanFields(req.body.fields);
  const tags = cleanTags(req.body.tags);
  const searchExtra = buildSearchExtra(fields, tags);

  const rows = await query<any>(
    `INSERT INTO products (title, description, image_url, target_url, status, search_extra)
     VALUES ($1,$2,$3,$4,$5,$6) RETURNING id`,
    [
      title,
      req.body.description ?? "",
      req.body.image_url ?? "",
      target_url,
      req.body.status ?? "published",
      searchExtra,
    ]
  );

  for (const f of fields) {
    await query(
      `INSERT INTO product_fields (product_id, key, value) VALUES ($1,$2,$3)`,
      [rows[0].id, f.key, f.value]
    );
  }
  for (const t of tags) {
    await query(`INSERT INTO product_tags (product_id, tag) VALUES ($1,$2)`, [rows[0].id, t]);
  }

  res.json({ id: rows[0].id });
});

adminRouter.put("/products/:id", requireAdmin, async (req, res) => {
  const id = req.params.id;
  const fields = cleanFields(req.body.fields);
  const tags = cleanTags(req.body.tags);
  const searchExtra = buildSearchExtra(fields, tags);

  await query(
    `UPDATE products SET title=$1, description=$2, image_url=$3,
     target_url=$4, status=$5, search_extra=$6, updated_at=now() WHERE id=$7`,
    [
      req.body.title,
      req.body.description ?? "",
      req.body.image_url ?? "",
      req.body.target_url,
      req.body.status ?? "published",
      searchExtra,
      id,
    ]
  );

  await query(`DELETE FROM product_fields WHERE product_id=$1`, [id]);
  await query(`DELETE FROM product_tags WHERE product_id=$1`, [id]);

  for (const f of fields) {
    await query(
      `INSERT INTO product_fields (product_id, key, value) VALUES ($1,$2,$3)`,
      [id, f.key, f.value]
    );
  }
  for (const t of tags) {
    await query(`INSERT INTO product_tags (product_id, tag) VALUES ($1,$2)`, [id, t]);
  }

  res.json({ ok: true });
});

adminRouter.delete("/products/:id", requireAdmin, async (req, res) => {
  const id = req.params.id;
  await query(`DELETE FROM product_fields WHERE product_id=$1`, [id]);
  await query(`DELETE FROM product_tags WHERE product_id=$1`, [id]);
  await query(`DELETE FROM products WHERE id=$1`, [id]);
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
  if (!email || password.length < 8)
    return res.status(400).json({ error: "Invalid input" });

  const hash = await bcrypt.hash(password, 10);
  const rows = await query<any>(
    `INSERT INTO admins (email, password_hash) VALUES ($1,$2)
     RETURNING id,email,created_at,updated_at`,
    [email, hash]
  );
  res.json(rows[0]);
});

adminRouter.put("/admins/:id", requireAdmin, async (req, res) => {
  const hash = await bcrypt.hash(String(req.body?.password ?? ""), 10);
  const rows = await query<any>(
    `UPDATE admins SET password_hash=$2, updated_at=now() WHERE id=$1
     RETURNING id,email,created_at,updated_at`,
    [req.params.id, hash]
  );
  res.json(rows[0]);
});

adminRouter.delete("/admins/:id", requireAdmin, async (req, res) => {
  await query(`DELETE FROM admins WHERE id=$1`, [req.params.id]);
  res.json({ ok: true });
});