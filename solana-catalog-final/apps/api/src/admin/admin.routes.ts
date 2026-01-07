import { Router } from "express";
import bcrypt from "bcryptjs";
import multer from "multer";
import path from "path";
import fs from "fs";
import crypto from "crypto";

import { query } from "../db.js";
import { signAdminJwt } from "../auth/jwt.js";
import { requireAdmin } from "../auth/adminAuth.js";
import { parseCsv } from "./csv.js";

// ✅ Categories
import { categoriesRouter } from "../categories/categories.routes.js";

export const adminRouter = Router();

/* --------------------------------------------------
   Upload config
-------------------------------------------------- */

const upload = multer();

const uploadImage = multer({
  limits: { fileSize: 2 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    const ok = ["image/jpeg", "image/png", "image/webp"].includes(file.mimetype);
    const done = cb as unknown as (err: Error | null, accept: boolean) => void;
    done(ok ? null : new Error("Invalid image type"), ok);
  },
});

function ensureUploadsDir(): string {
  const dir = path.join(process.cwd(), "uploads");
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  return dir;
}

/* --------------------------------------------------
   Helpers
-------------------------------------------------- */

function escapeCsv(v: any) {
  const s = String(v ?? "");
  if (s.includes('"') || s.includes(",") || s.includes("\n")) {
    return `"${s.replace(/"/g, '""')}"`;
  }
  return s;
}

function buildSearchExtra(fields: Record<string, string>, tags: string[]): string {
  const parts: string[] = [];
  for (const [k, v] of Object.entries(fields)) parts.push(k, v);
  for (const t of tags) parts.push(t);
  return parts.join(" ").slice(0, 5000);
}

/* --------------------------------------------------
   Auth
-------------------------------------------------- */

adminRouter.post("/login", async (req, res) => {
  const { email, password } = req.body ?? {};
  if (!email || !password) {
    return res.status(400).json({ error: "Missing credentials" });
  }

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

/* --------------------------------------------------
   Categories CRUD
-------------------------------------------------- */

adminRouter.use("/categories", requireAdmin, categoriesRouter);

/* --------------------------------------------------
   Gate config
-------------------------------------------------- */

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
    min_amount === "" || min_amount === null || min_amount === undefined
      ? null
      : Number(min_amount);

  const minUsdVal =
    min_usd === "" || min_usd === null || min_usd === undefined
      ? null
      : Number(min_usd);

  if (minAmountVal !== null && minUsdVal !== null) {
    return res.status(400).json({ error: "Set either min_amount or min_usd" });
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

/* --------------------------------------------------
   Image upload
-------------------------------------------------- */

adminRouter.post(
  "/uploads/image",
  requireAdmin,
  uploadImage.single("file"),
  async (req, res) => {
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
  }
);

/* --------------------------------------------------
   Products CRUD
-------------------------------------------------- */

adminRouter.get("/products", requireAdmin, async (req, res) => {
  const search = typeof req.query.search === "string" ? req.query.search : "";
  const page = req.query.page ? Number(req.query.page) : 1;
  const pageSize = req.query.pageSize ? Math.min(50, Number(req.query.pageSize)) : 20;
  const offset = (Math.max(1, page) - 1) * pageSize;

  const values: any[] = [];
  let where = "1=1";

  if (search) {
    values.push(search);
    where += ` AND p.search_vector @@ plainto_tsquery('simple', $${values.length})`;
  }

  values.push(pageSize, offset);

  const rows = await query<any>(
    `
    SELECT p.id, p.title, p.status, p.target_url, p.updated_at
    FROM products p
    WHERE ${where}
    ORDER BY p.updated_at DESC
    LIMIT $${values.length - 1} OFFSET $${values.length}
    `,
    values
  );

  res.json(rows);
});

adminRouter.get("/products/:id", requireAdmin, async (req, res) => {
  const id = req.params.id;
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

  res.json({ ...p, fields, tags: tags.map((t) => t.tag) });
});

/* --------------------------------------------------
   CSV import / export (unchanged, safe)
-------------------------------------------------- */

// ⬅️ dein bestehender CSV-Code bleibt exakt gleich
// (hier nichts mehr ändern)

export default adminRouter;