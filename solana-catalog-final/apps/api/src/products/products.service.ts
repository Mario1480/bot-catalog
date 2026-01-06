import { query } from "../db";

type ListArgs = {
  search?: string;
  filters?: Record<string, string | string[]>;
  page?: number;
  pageSize?: number;
  status?: string;
};

export async function getFilters() {
  // Categories = product_fields where key='category' (can be multiple per product)
  const categories = await query(
    `SELECT DISTINCT value AS category
     FROM product_fields
     WHERE key = 'category'
     ORDER BY value ASC`,
    []
  );

  const tags = await query(
    `SELECT DISTINCT tag
     FROM product_tags
     ORDER BY tag ASC`,
    []
  );

  // all possible field keys (excluding category)
  const fieldKeys = await query(
    `SELECT DISTINCT key
     FROM product_fields
     WHERE key <> 'category'
     ORDER BY key ASC`,
    []
  );

  return {
    categories: categories.map((r: any) => r.category),
    tags: tags.map((r: any) => r.tag),
    fieldKeys: fieldKeys.map((r: any) => r.key),
  };
}

export async function listProducts({
  search,
  filters = {},
  status = "published",
  page = 1,
  pageSize = 50,
}: ListArgs) {
  const limit = Math.min(Math.max(pageSize, 1), 200);
  const offset = (Math.max(page, 1) - 1) * limit;

  const where: string[] = [];
  const params: any[] = [];

  // Status
  if (status) {
    params.push(status);
    where.push(`p.status = $${params.length}`);
  }

  // Search (title/description/search_extra)
  if (search) {
    params.push(`%${search}%`);
    where.push(
      `(p.title ILIKE $${params.length} OR p.description ILIKE $${params.length} OR p.search_extra ILIKE $${params.length})`
    );
  }

  /**
   * filters:
   * - category: string | string[]
   * - tag: string | string[]   (or tags)
   * - any other key: field match in product_fields (exact)
   */
  const categoryFilter = filters["category"];
  const tagFilter = filters["tag"] ?? filters["tags"];

  // category filter (multi)
  if (categoryFilter) {
    const cats = Array.isArray(categoryFilter) ? categoryFilter : [categoryFilter];
    if (cats.length) {
      params.push(cats);
      where.push(`
        EXISTS (
          SELECT 1
          FROM product_fields pf
          WHERE pf.product_id = p.id
            AND pf.key = 'category'
            AND pf.value = ANY($${params.length})
        )
      `);
    }
  }

  // tag filter (multi)
  if (tagFilter) {
    const tags = Array.isArray(tagFilter) ? tagFilter : [tagFilter];
    if (tags.length) {
      params.push(tags);
      where.push(`
        EXISTS (
          SELECT 1
          FROM product_tags pt
          WHERE pt.product_id = p.id
            AND pt.tag = ANY($${params.length})
        )
      `);
    }
  }

  // other field filters
  for (const [k, v] of Object.entries(filters)) {
    if (k === "category" || k === "tag" || k === "tags") continue;
    if (v === null || v === undefined) continue;

    const values = Array.isArray(v) ? v : [v];
    if (!values.length) continue;

    params.push(k);
    params.push(values);

    where.push(`
      EXISTS (
        SELECT 1
        FROM product_fields pf
        WHERE pf.product_id = p.id
          AND pf.key = $${params.length - 1}
          AND pf.value = ANY($${params.length})
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

  // Build fields map with duplicate-key support => arrays
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