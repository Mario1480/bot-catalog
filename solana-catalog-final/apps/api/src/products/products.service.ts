import { query } from "../db.js";

export async function listProducts(params: {
  search?: string;
  filters?: Record<string, string>;
  page?: number;
  pageSize?: number;
}) {
  const page = Math.max(1, params.page ?? 1);
  const pageSize = Math.min(50, Math.max(1, params.pageSize ?? 12));
  const offset = (page - 1) * pageSize;

  const values: any[] = [];
  let where = `p.status = 'published'`;

  // Volltextsuche über search_vector (falls vorhanden)
  if (params.search) {
    values.push(params.search);
    where += ` AND p.search_vector @@ plainto_tsquery('simple', $${values.length})`;
  }

  // Filter: EXISTS in product_fields
  const filterEntries = Object.entries(params.filters ?? {});
  for (const [k, v] of filterEntries) {
    values.push(k, v);
    const kIdx = values.length - 1;
    const vIdx = values.length;
    where += ` AND EXISTS (
      SELECT 1 FROM product_fields f
      WHERE f.product_id = p.id AND f.key = $${kIdx} AND f.value = $${vIdx}
    )`;
  }

  values.push(pageSize, offset);

  const rows = await query<any>(
    `
    SELECT p.id, p.title, p.description, p.image_url, p.target_url, p.status, p.updated_at
    FROM products p
    WHERE ${where}
    ORDER BY p.updated_at DESC
    LIMIT $${values.length - 1} OFFSET $${values.length}
    `,
    values
  );

  return rows;
}

export async function getFilters() {
  // Liefert z.B. { category: ["Bots","Tools"], ... }
  const rows = await query<{ key: string; value: string }>(
    `SELECT key, value FROM product_fields GROUP BY key, value ORDER BY key, value`
  );

  const out: Record<string, string[]> = {};
  for (const r of rows) {
    out[r.key] = out[r.key] ?? [];
    out[r.key].push(r.value);
  }
  return out;
}