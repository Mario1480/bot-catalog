import { query } from "../db";

// ...

export async function listProducts({
  q,
  tags,
  fields,
  status = "published",
  page = 1,
  limit = 50,
}: {
  q?: string;
  tags?: string[];
  fields?: Record<string, string>;
  status?: string;
  page?: number;
  limit?: number;
}) {
  const offset = (Math.max(page, 1) - 1) * limit;

  const where: string[] = [];
  const params: any[] = [];

  // Status filter
  if (status) {
    params.push(status);
    where.push(`p.status = $${params.length}`);
  }

  // q search
  if (q) {
    params.push(`%${q}%`);
    where.push(`(p.title ILIKE $${params.length} OR p.search_extra ILIKE $${params.length})`);
  }

  // tags filter (requires product_tags join)
  if (tags && tags.length) {
    params.push(tags);
    where.push(`
      EXISTS (
        SELECT 1 FROM product_tags pt
        WHERE pt.product_id = p.id
          AND pt.tag = ANY($${params.length})
      )
    `);
  }

  // fields filter: key/value exact match
  if (fields && Object.keys(fields).length) {
    for (const [k, v] of Object.entries(fields)) {
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