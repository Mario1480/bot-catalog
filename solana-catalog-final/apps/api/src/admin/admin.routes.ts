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

const uploadImage = multer({
  limits: { fileSize: 2 * 1024 * 1024 }, // 2MB
  fileFilter: (_req, file, cb) => {
    const ok = ["image/jpeg", "image/png", "image/webp"].includes(file.mimetype);
    const done = cb as unknown as (error: Error | null, acceptFile: boolean) => void;
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
  const arr = Array.isArray(input) ? input : [];
  return arr
    .map((f: any) => ({
      key: String(f?.key ?? "").trim(),
      value: String(f?.value ?? "").trim(),
    }))
    .filter((f) => f.key && f.value);
}

function cleanTags(input: any): string[] {
  const arr = Array.isArray(input) ? input : [];
  return arr.map((t: any) => String(t).trim()).filter(Boolean);
}

function buildSearchExtra(fields: FieldKV[], tags: string[]): string {
  const parts: string[] = [];
  for (const f of fields) {
    if (!f?.key || !f?.value) continue;
    parts.push(String(f.key), String(f.value));
  }
  for (const t of tags) parts.push(t);
  return parts.join(" ").slice(0, 5000);
}

/* ------------------ AUTH ------------------ */
adminRouter.post("/login", async (req, res) => {
  const emailRaw = String(req.body?.email ?? "");
  const passRaw = String(req.body?.password ?? "");

  const email = emailRaw.trim().toLowerCase();
  const password = passRaw;

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

  try {
    if (mode === "usd") {
      priceUsd = await fetchPrice();
      requiredUsd = Number(cfg.min_usd);
      if (Number.isFinite(requiredUsd) && priceUsd > 0) {
        requiredTokens = requiredUsd / priceUsd;
      }
    }

    if (mode === "amount") {
      requiredTokens = Number(cfg.min_amount);
      if (!Number.isFinite(requiredTokens)) requiredTokens = null;

      try {
        priceUsd = await fetchPrice();
        if (priceUsd > 0 && requiredTokens !== null) {
          requiredUsd = requiredTokens * priceUsd;
        }
      } catch {
        // ignore
      }
    }
  } catch (e: any) {
    if (mode === "usd") {
      return res.status(500).json({ error: e?.message || "Failed to fetch price" });
    }
  }

  res.json({
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
  const dir = ensureUploadsDir();
  fs.writeFileSync(path.join(dir, name), req.file.buffer);

  res.json({ publicUrl: `/uploads/${name}` });
});

/* ------------------ CATEGORIES ------------------ */
adminRouter.use("/categories", requireAdmin, categoriesRouter);

/* ------------------ PRODUCTS CRUD ------------------ */
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

adminRouter.get("/products/:id", requireAdmin, async (req, res) => {
  const id = String(req.params.id || "");
  const p = (await query<any>(`SELECT * FROM products WHERE id = $1`, [id]))[0];
  if (!p) return res.status(404).json({ error: "Not found" });

  const fields = await query<any>(
    `SELECT key, value FROM product_fields WHERE product_id = $1 ORDER BY key`,
    [id]
  );
  const tags = await query<any>(`SELECT tag FROM product_tags WHERE product_id = $1 ORDER BY tag`, [id]);

  res.json({ ...p, fields, tags: tags.map((t) => t.tag) });
});

adminRouter.post("/products", requireAdmin, async (req, res) => {
  const { title, description, image_url, target_url, status, fields, tags } = req.body ?? {};
  if (!title || !target_url) return res.status(400).json({ error: "title and target_url are required" });

  const fieldsList = cleanFields(fields); // keep duplicates for multi-category
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
    await query(
      `INSERT INTO product_fields (product_id, key, value) VALUES ($1,$2,$3)`,
      [id, f.key, f.value]
    );
  }
  for (const t of tagList) {
    await query(`INSERT INTO product_tags (product_id, tag) VALUES ($1,$2)`, [id, t]);
  }

  res.json({ id });
});

adminRouter.put("/products/:id", requireAdmin, async (req, res) => {
  const id = String(req.params.id || "");
  const { title, description, image_url, target_url, status, fields, tags } = req.body ?? {};
  if (!title || !target_url) return res.status(400).json({ error: "title and target_url are required" });

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
    await query(
      `INSERT INTO product_fields (product_id, key, value) VALUES ($1,$2,$3)`,
      [id, f.key, f.value]
    );
  }
  for (const t of tagList) {
    await query(`INSERT INTO product_tags (product_id, tag) VALUES ($1,$2)`, [id, t]);
  }

  res.json({ ok: true });
});

adminRouter.delete("/products/:id", requireAdmin, async (req, res) => {
  const id = String(req.params.id || "");
  await query(`DELETE FROM product_fields WHERE product_id = $1`, [id]);
  await query(`DELETE FROM product_tags WHERE product_id = $1`, [id]);
  await query(`DELETE FROM products WHERE id = $1`, [id]);
  res.json({ ok: true });
});

/* ------------------ CSV IMPORT/EXPORT (semicolon format) ------------------ */
adminRouter.post("/products/import-csv", requireAdmin, upload.single("file"), async (req, res) => {
  if (!req.file?.buffer) return res.status(400).json({ error: "Missing file" });
  const out = await importProductsCsvSemicolon(req.file.buffer);
  res.json(out);
});

adminRouter.get("/products/export-csv", requireAdmin, async (_req, res) => {
  const csv = await exportProductsCsvSemicolon();
  res.setHeader("Content-Type", "text/csv; charset=utf-8");
  res.setHeader("Content-Disposition", "attachment; filename=products_export.csv");
  res.send(csv);
});

/* ------------------ ADMINS CRUD ------------------ */

// GET /admin/admins
adminRouter.get("/admins", requireAdmin, async (_req, res) => {
  const rows = await query<any>(
    `SELECT id, email, created_at, updated_at
     FROM admins
     ORDER BY created_at DESC`
  );
  res.json(rows);
});

// POST /admin/admins
adminRouter.post("/admins", requireAdmin, async (req, res) => {
  const emailRaw = String(req.body?.email ?? "");
  const passRaw = String(req.body?.password ?? "");

  const email = emailRaw.trim().toLowerCase();
  const password = passRaw;

  if (!email || !password) return res.status(400).json({ error: "email and password are required" });
  if (password.length < 8) return res.status(400).json({ error: "password must be at least 8 characters" });

  const existing = await query<any>(`SELECT id FROM admins WHERE email = $1`, [email]);
  if (existing[0]) return res.status(409).json({ error: "Admin already exists" });

  const password_hash = await bcrypt.hash(password, 10);

  const rows = await query<any>(
    `
    INSERT INTO admins (email, password_hash)
    VALUES ($1, $2)
    RETURNING id, email, created_at, updated_at
    `,
    [email, password_hash]
  );

  res.json(rows[0]);
});

// PUT /admin/admins/:id  (Reset password)
adminRouter.put("/admins/:id", requireAdmin, async (req: any, res) => {
  const id = String(req.params.id || "");
  const password = String(req.body?.password ?? "");

  if (!id) return res.status(400).json({ error: "Missing id" });
  if (!password) return res.status(400).json({ error: "password is required" });
  if (password.length < 8) return res.status(400).json({ error: "password must be at least 8 characters" });

  const password_hash = await bcrypt.hash(password, 10);

  const rows = await query<any>(
    `
    UPDATE admins
    SET password_hash = $2, updated_at = now()
    WHERE id = $1
    RETURNING id, email, created_at, updated_at
    `,
    [id, password_hash]
  );

  if (!rows[0]) return res.status(404).json({ error: "Not found" });
  res.json(rows[0]);
});

// DELETE /admin/admins/:id
adminRouter.delete("/admins/:id", requireAdmin, async (req: any, res) => {
  const id = String(req.params.id || "");
  if (!id) return res.status(400).json({ error: "Missing id" });

  const meId = String(req.admin?.id || "");
  if (meId && id === meId) {
    return res.status(400).json({ error: "You cannot delete your own admin account" });
  }

  const rows = await query<any>(`DELETE FROM admins WHERE id = $1 RETURNING id`, [id]);
  if (!rows[0]) return res.status(404).json({ error: "Not found" });

  res.json({ ok: true });
});