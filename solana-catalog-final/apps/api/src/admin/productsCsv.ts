// apps/api/src/admin/productsCsv.ts
import { query } from "../db.js";

export type FieldKV = { key: string; value: string };

export const HEADER = [
  "ID",
  "Name",
  "Description",
  "Image",
  "Category",
  "Tags",
  "Trading",
  "Leverage",
  "Price...Loss (SL)",
  "Take-Profit (TP)",
  "Minimum Invest",
  "Start Level",
  "Bot Link",
];

export const MAIN_COLS = new Set(HEADER);
export const LEGACY_COLS = new Set(["Laverage"]);
export const FIXED_FIELD_KEYS = [
  "Trading",
  "Leverage",
  "Price...Loss (SL)",
  "Take-Profit (TP)",
  "Minimum Invest",
  "Start Level",
];

function esc(v: any) {
  const s = String(v ?? "");
  // semicolon CSV -> escape if contains ; " newline
  if (s.includes('"') || s.includes(";") || s.includes("\n")) return `"${s.replace(/"/g, '""')}"`;
  return s;
}

export function splitList(v: any): string[] {
  const s = String(v ?? "").trim();
  if (!s) return [];
  // allow "a|b|c" or "a, b, c"
  return s
    .split(/[\|,]/g)
    .map((x) => x.trim())
    .filter(Boolean);
}

export async function exportProductsCsvSemicolon(): Promise<string> {
  const products = await query<any>(`SELECT * FROM products ORDER BY updated_at DESC`);

  if (!products.length) {
    return HEADER.join(";") + "\n";
  }

  const ids = products.map((p: any) => p.id);

  const fields = await query<any>(
    `SELECT product_id, key, value FROM product_fields WHERE product_id = ANY($1::uuid[])`,
    [ids]
  );

  const tags = await query<any>(
    `SELECT product_id, tag FROM product_tags WHERE product_id = ANY($1::uuid[])`,
    [ids]
  );

  const fieldsMap: Record<string, FieldKV[]> = {};
  for (const f of fields) {
    (fieldsMap[f.product_id] ||= []).push({ key: String(f.key), value: String(f.value) });
  }

  const tagsMap: Record<string, string[]> = {};
  for (const t of tags) {
    (tagsMap[t.product_id] ||= []).push(String(t.tag));
  }

  let out = HEADER.join(";") + "\n";

  for (const p of products) {
    const pid = p.id;
    const list = fieldsMap[pid] || [];
    const tagList = tagsMap[pid] || [];

    const cats = list.filter((x) => x.key === "category").map((x) => x.value);
    const getField = (k: string) => (list.find((x) => x.key === k)?.value ?? "");
    const getLeverageField = () => getField("Leverage") || getField("Laverage");

    const row = [
      p.id,
      p.title ?? "",
      p.description ?? "",
      p.image_url ?? "",
      cats.join("|"),
      tagList.join("|"),
      getField("Trading"),
      getLeverageField(),
      getField("Price...Loss (SL)"),
      getField("Take-Profit (TP)"),
      getField("Minimum Invest"),
      getField("Start Level"),
      p.target_url ?? "",
    ].map(esc);

    out += row.join(";") + "\n";
  }

  return out;
}

export function parseSemicolonCsv(buffer: Buffer): Record<string, string>[] {
  const text = buffer.toString("utf-8").replace(/\r\n/g, "\n").replace(/\r/g, "\n");
  const lines = text.split("\n").filter((l) => l.trim().length > 0);
  if (!lines.length) return [];

  // very small CSV parser for semicolon + quotes
  const parseLine = (line: string) => {
    const cells: string[] = [];
    let cur = "";
    let inQ = false;

    for (let i = 0; i < line.length; i++) {
      const ch = line[i];

      if (inQ) {
        if (ch === '"') {
          if (line[i + 1] === '"') {
            cur += '"';
            i++;
          } else {
            inQ = false;
          }
        } else {
          cur += ch;
        }
      } else {
        if (ch === '"') inQ = true;
        else if (ch === ";") {
          cells.push(cur);
          cur = "";
        } else cur += ch;
      }
    }
    cells.push(cur);
    return cells.map((c) => c.trim());
  };

  const header = parseLine(lines[0]);
  const rows: Record<string, string>[] = [];

  for (let i = 1; i < lines.length; i++) {
    const cols = parseLine(lines[i]);
    const obj: Record<string, string> = {};
    for (let j = 0; j < header.length; j++) {
      obj[header[j]] = cols[j] ?? "";
    }
    rows.push(obj);
  }

  return rows;
}

export async function importProductsCsvSemicolon(buffer: Buffer) {
  const rows = parseSemicolonCsv(buffer);
  const report: any[] = [];

  for (let i = 0; i < rows.length; i++) {
    const r = rows[i];
    try {
      const title = String(r["Name"] ?? "").trim();
      const description = String(r["Description"] ?? "");
      const image_url = String(r["Image"] ?? "");
      const target_url = String(r["Bot Link"] ?? "").trim();
      const status = "published"; // in deinem CSV nicht enthalten -> default
      const tags = splitList(r["Tags"]);
      const categories = splitList(r["Category"]);

      if (!title || !target_url) throw new Error("Name and Bot Link are required");

      // fields: fixed columns + any extra columns (future proof)
      const fields: FieldKV[] = [];

      for (const c of categories) fields.push({ key: "category", value: c });

      for (const k of FIXED_FIELD_KEYS) {
        const v =
          k === "Leverage" ? String(r[k] ?? r["Laverage"] ?? "").trim() : String(r[k] ?? "").trim();
        if (v) fields.push({ key: k, value: v });
      }

      // optional: any unknown columns -> fields
      for (const [k, v] of Object.entries(r)) {
        if (MAIN_COLS.has(k) || LEGACY_COLS.has(k)) continue;
        const vv = String(v ?? "").trim();
        if (!vv) continue;
        fields.push({ key: String(k).trim(), value: vv });
      }

      const searchExtra = [
        title,
        description,
        ...fields.flatMap((f) => [f.key, f.value]),
        ...tags,
      ]
        .join(" ")
        .slice(0, 5000);

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

      for (const f of fields) {
        await query(
          `INSERT INTO product_fields (product_id, key, value) VALUES ($1,$2,$3)`,
          [productId, f.key, f.value]
        );
      }
      for (const t of tags) {
        await query(`INSERT INTO product_tags (product_id, tag) VALUES ($1,$2)`, [productId, t]);
      }

      report.push({ row: i + 2, ok: true, target_url });
    } catch (e: any) {
      report.push({ row: i + 2, ok: false, error: e?.message ?? String(e) });
    }
  }

  return { imported: report.filter((x) => x.ok).length, report };
}
