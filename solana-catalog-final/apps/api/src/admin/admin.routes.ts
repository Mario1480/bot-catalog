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
import { parseCsv } from "./csv.js";
import { categoriesRouter } from "../categories/categories.routes.js";

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

function escapeCsv(v: any) {
  const s = String(v ?? "");
  if (s.includes('"') || s.includes(",") || s.includes("\n")) return `"${s.replace(/"/g, '""')}"`;
  return s;
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
  const { email, password } = req.body ?? {};
  if (!email || !password) return res.status(400).json({ error: "Missing credentials" });

  const rows = await query<{ id: string; email: string; password_hash: string }>(
    `SELECT id, email, password_hash FROM admins WHERE email = $1`,
    [String(email)]
  );

  const admin = rows[0];
  if (!admin) return res.status(401).json({ error: "Invalid credentials" });

  const ok = await bcrypt.compare(String(password), admin.password_hash);
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

/* ------------------ UPLOADS ------------------ */
adminRouter.post("/uploads/image", requireAdmin, uploadImage.single("file"), async (req, res) => {
  if (!req.file) return res.status(400).json({ error: "Missing file" });

  const ext =
    req.file.mimetype === "image/png" ? ".png" : req.file.mimetype === "image/webp" ? ".webp" : ".jpg";

  const name = `${Date.now()}-${crypto.randomBytes(8).toString("hex")}${ext}`;
  const dir = ensureUploadsDir();
  fs.writeFileSync(path.join(dir, name), req.file.buffer);

  res.json({ publicUrl: `/uploads/${name}` });
});

/* ------------------ CATEGORIES (Admin) ------------------ */
/**
 * Provides:
 *  GET    /admin/categories
 *  POST   /admin/categories
 *  PUT    /admin/categories/:id
 *  DELETE /admin/categories/:id
 */
adminRouter.use("/categories", requireAdmin, categoriesRouter);

/* ------------------ PRODUCTS CRUD ------------------ */
adminRouter.get("/products", requireAdmin, async (req, res) => {
  const search = typeof req.query.search === "string" ? req.query.search.trim() : "";
  const page = req.query.page ? Number(req.query.page) : 1;
  const pageSize = req.query.pageSize ? Math.min(50, Number(req.query.pageSize)) : 20;
  const offset = (Math.max(1, page) - 1) * pageSize;

  const values: any[] = [];
  const where: string[] = ["1=1"];

  // Safe, works without search_vector
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

  // IMPORTANT: keep duplicates (e.g. multiple category rows)
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
    await query(`INSERT INTO product_fields (product_id, key, value) VALUES ($1,$2,$3)`, [id, f.key, f.value]);
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

  // IMPORTANT: keep duplicates (e.g. multiple category rows)
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
    await query(`INSERT INTO product_fields (product_id, key, value) VALUES ($1,$2,$3)`, [id, f.key, f.value]);
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

/* ------------------ CSV IMPORT/EXPORT ------------------ */
adminRouter.post("/products/import-csv", requireAdmin, upload.single("file"), async (req, res) => {
  if (!req.file?.buffer) return res.status(400).json({ error: "Missing file" });

  const rows = await parseCsv(req.file.buffer);
  const report: any[] = [];

  for (let i = 0; i < rows.length; i++) {
    const r = rows[i];
    try {
      const title = String(r.title ?? "").trim();
      const description = String(r.description ?? "");
      const image_url = String(r.image_url ?? "");
      const target_url = String(r.target_url ?? "").trim();
      const status = String(r.status ?? "published");
      const tags = String(r.tags ?? "");
      const fieldsJson = String(r.fields_json ?? "{}");

      if (!title || !target_url) throw new Error("title and target_url are required");

      const parsed = JSON.parse(fieldsJson);
      const fieldsList: FieldKV[] = [];
      if (parsed && typeof parsed === "object") {
        for (const [k, v] of Object.entries(parsed)) {
          const kk = String(k).trim();
          const vv = String(v).trim();
          if (kk && vv) fieldsList.push({ key: kk, value: vv });
        }
      }

      const tagList = tags ? tags.split("|").map((x: string) => x.trim()).filter(Boolean) : [];
      const searchExtra = buildSearchExtra(fieldsList, tagList);

      const up = await query<{ id: string }>(
        `
        INSERT INTO products (title, description, image_url, target_url, status, search_extra)
        VALUES ($1, $2, $3, $4, $5, $6)
        ON CONFLICT (target_url) DO UPDATE
          SET title = EXCLUDED.title,
              description = EXCLUDED.description,
              image_url = EXCLUDED.image_url,
              status = EXCLUDED.status,
              search_extra = EXCLUDED.search_extra,
              updated_at = now()
        RETURNING id
        `,
        [title, description, image_url, target_url, status, searchExtra]
      );

      const productId = up[0].id;

      await query(`DELETE FROM product_fields WHERE product_id = $1`, [productId]);
      await query(`DELETE FROM product_tags WHERE product_id = $1`, [productId]);

      for (const f of fieldsList) {
        await query(`INSERT INTO product_fields (product_id, key, value) VALUES ($1, $2, $3)`, [
          productId,
          f.key,
          f.value,
        ]);
      }
      for (const t of tagList) {
        await query(`INSERT INTO product_tags (product_id, tag) VALUES ($1, $2)`, [productId, t]);
      }

      report.push({ row: i + 2, ok: true });
    } catch (e: any) {
      report.push({ row: i + 2, ok: false, error: e.message ?? String(e) });
    }
  }

  res.json({ imported: report.filter((r) => r.ok).length, report });
});

adminRouter.get("/products/export-csv", requireAdmin, async (_req, res) => {
  const products = await query<any>(`SELECT * FROM products ORDER BY updated_at DESC`);

  let csv = "title,description,image_url,target_url,status,fields_json,tags\n";

  for (const p of products) {
    const fields = await query<any>(`SELECT key, value FROM product_fields WHERE product_id = $1`, [p.id]);
    const tags = await query<any>(`SELECT tag FROM product_tags WHERE product_id = $1`, [p.id]);

    // NOTE: CSV export uses object => duplicate keys will be overwritten in this format.
    // That’s OK for export/import basics, but "multi category" would need a different export schema.
    const fieldsObj: Record<string, any> = {};
    for (const f of fields) fieldsObj[f.key] = f.value;

    const tagsStr = tags.map((t: any) => t.tag).join("|");

    const line = [
      escapeCsv(p.title),
      escapeCsv(p.description),
      escapeCsv(p.image_url),
      escapeCsv(p.target_url),
      escapeCsv(p.status),
      escapeCsv(JSON.stringify(fieldsObj)),
      escapeCsv(tagsStr),
    ].join(",");

    csv += line + "\n";
  }

  res.setHeader("Content-Type", "text/csv");
  res.setHeader("Content-Disposition", "attachment; filename=products.csv");
  res.send(csv);
});

// ------------------ ADMINS CRUD ------------------

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
  const { email, password } = req.body ?? {};
  const e = String(email ?? "").trim().toLowerCase();
  const p = String(password ?? "");

  if (!e || !p) return res.status(400).json({ error: "email and password are required" });
  if (p.length < 8) return res.status(400).json({ error: "password must be at least 8 characters" });

  const existing = await query<any>(`SELECT id FROM admins WHERE email = $1`, [e]);
  if (existing[0]) return res.status(409).json({ error: "Admin already exists" });

  const password_hash = await bcrypt.hash(p, 10);

  const rows = await query<any>(
    `
    INSERT INTO admins (email, password_hash)
    VALUES ($1, $2)
    RETURNING id, email, created_at, updated_at
    `,
    [e, password_hash]
  );

  res.json(rows[0]);
});

// DELETE /admin/admins/:id
adminRouter.delete("/admins/:id", requireAdmin, async (req: any, res) => {
  const id = String(req.params.id || "");
  if (!id) return res.status(400).json({ error: "Missing id" });

  // requireAdmin setzt req.admin (so ist es bei dir üblich). Falls es bei dir anders heißt:
  // passe diese Zeile an.
  const meId = String(req.admin?.id || "");

  // sich selbst nicht löschen
  if (meId && id === meId) {
    return res.status(400).json({ error: "You cannot delete your own admin account" });
  }

  const rows = await query<any>(`DELETE FROM admins WHERE id = $1 RETURNING id`, [id]);
  if (!rows[0]) return res.status(404).json({ error: "Not found" });

  res.json({ ok: true });
});