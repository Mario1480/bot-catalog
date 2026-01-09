import { query } from "../db.js";

type ListArgs = {
  search?: string;
  filters?: Record<string, string>;
  page?: number;
  pageSize?: number;
};

function normalizeFilters(filters?: Record<string, string>) {
  const out: Record<string, string> = {};
  if (!filters) return out;
  for (const [k, v] of Object.entries(filters)) {
    const kk = String(k || "").trim();
    const vv = String(v || "").trim();
    if (!kk || !vv) continue;
    out[kk] = vv;
  }
  return out;
}

export async function getFilters() {
  // Categories come from product_fields where key='category'
  const categoryRows = await query(
    `
    SELECT DISTINCT pf.value AS category
    FROM product_fields pf
    JOIN products p ON p.id = pf.product_id
    WHERE pf.key = 'category'
      AND p.status = 'published'
    ORDER BY pf.value ASC
    `
  );

  const tagRows = await query(
    `
    SELECT DISTINCT pt.tag
    FROM product_tags pt
    JOIN products p ON p.id = pt.product_id
    WHERE p.status = 'published'
    ORDER BY pt.tag ASC
    `
  );

  return {
    categories: categoryRows.map((r: any) => r.category),
    tags: tagRows.map((r: any) => r.tag),
  };
}

export async function listProducts({
  search,
  filters,
  page = 1,
  pageSize = 12,
}: ListArgs) {
  const qStr = typeof search === "string" ? search.trim() : "";
  const f = normalizeFilters(filters);

  const limit = Math.min(Math.max(Number(pageSize) || 12, 1), 100);
  const offset = (Math.max(Number(page) || 1, 1) - 1) * limit;

  const where: string[] = [];
  const params: any[] = [];

  // Always show only published on public products endpoint
  params.push("published");
  where.push(`p.status = $${params.length}`);

  if (qStr) {
    params.push(`%${qStr}%`);
    where.push(
      `(p.title ILIKE $${params.length} OR p.description ILIKE $${params.length} OR COALESCE(p.search_extra,'') ILIKE $${params.length})`
    );
  }

  // filters -> key/value exact match in product_fields
  for (const [k, v] of Object.entries(f)) {
    if (k === "tag" || k === "tags") {
      params.push(v);
      where.push(`
        EXISTS (
          SELECT 1 FROM product_tags pt
          WHERE pt.product_id = p.id
            AND pt.tag = $${params.length}
        )
      `);
      continue;
    }

    params.push(k);
    params.push(v);
    where.push(`
      EXISTS (
        SELECT 1 FROM product_fields pf
        WHERE pf.product_id = p.id
          AND pf.key = $${params.length - 1}
          AND pf.value = $${params.length}
      )
    `);
  }

  const whereSql = where.length ? `WHERE ${where.join(" AND ")}` : "";

  const rows = await query(
    `
    SELECT p.id, p.title, p.description, p.image_url, p.target_url, p.status, p.updated_at
    FROM products p
    ${whereSql}
    ORDER BY p.updated_at DESC
    LIMIT $${params.length + 1}
    OFFSET $${params.length + 2}
    `,
    [...params, limit, offset]
  );

  if (!rows.length) return [];

  const ids = rows.map((r: any) => r.id);

  const fieldRows = await query(
    `SELECT product_id, key, value FROM product_fields WHERE product_id = ANY($1::uuid[])`,
    [ids]
  );

  const tagRows = await query(
    `SELECT product_id, tag FROM product_tags WHERE product_id = ANY($1::uuid[])`,
    [ids]
  );

  // Build fields map (duplicate keys => array)
  const fieldsMap: Record<string, Record<string, any>> = {};
  for (const fr of fieldRows) {
    const pid = fr.product_id;
    fieldsMap[pid] ||= {};
    const curr = fieldsMap[pid][fr.key];

    if (curr === undefined) fieldsMap[pid][fr.key] = fr.value;
    else if (Array.isArray(curr)) fieldsMap[pid][fr.key] = [...curr, fr.value];
    else fieldsMap[pid][fr.key] = [curr, fr.value];
  }

  const tagsMap: Record<string, string[]> = {};
  for (const tr of tagRows) {
    tagsMap[tr.product_id] ||= [];
    tagsMap[tr.product_id].push(tr.tag);
  }

  return rows.map((p: any) => ({
    ...p,
    fields: fieldsMap[p.id] || {},
    tags: tagsMap[p.id] || [],
  }));
}

export async function listFavoriteProductIds(pubkey: string): Promise<string[]> {
  const rows = await query<{ product_id: string }>(
    `
    SELECT product_id
    FROM user_favorites
    WHERE pubkey = $1
    ORDER BY created_at DESC
    `,
    [pubkey]
  );

  return rows.map((r) => r.product_id);
}

export async function addFavorite(pubkey: string, productId: string) {
  const exists = await query<{ id: string }>(`SELECT id FROM products WHERE id = $1`, [productId]);
  if (!exists[0]) throw new Error("Product not found");

  await query(
    `
    INSERT INTO user_favorites (pubkey, product_id)
    VALUES ($1, $2)
    ON CONFLICT (pubkey, product_id) DO NOTHING
    `,
    [pubkey, productId]
  );

  return { ok: true };
}

export async function removeFavorite(pubkey: string, productId: string) {
  const rows = await query(
    `
    DELETE FROM user_favorites
    WHERE pubkey = $1 AND product_id = $2
    RETURNING product_id
    `,
    [pubkey, productId]
  );

  if (!rows[0]) return { ok: false, removed: false };
  return { ok: true, removed: true };
}
