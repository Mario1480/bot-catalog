import { query } from "../db.js";

export type Category = {
  id: string;
  name: string;
  sort_order: number;
  active: boolean;
  created_at: string;
  updated_at: string;
};

export async function listCategories(opts?: { includeInactive?: boolean }) {
  const includeInactive = !!opts?.includeInactive;

  const rows = await query(
    `
    SELECT id, name, sort_order, active, created_at, updated_at
    FROM categories
    ${includeInactive ? "" : "WHERE active = TRUE"}
    ORDER BY sort_order ASC, name ASC
    `
  );

  return rows;
}

export async function createCategory(input: { name: string; sort_order?: number; active?: boolean }) {
  const name = (input.name || "").trim();
  if (!name) throw new Error("Name is required");

  const sort_order = Number.isFinite(Number(input.sort_order)) ? Number(input.sort_order) : 0;
  const active = input.active === undefined ? true : !!input.active;

  const rows = await query(
    `
    INSERT INTO categories (name, sort_order, active)
    VALUES ($1, $2, $3)
    RETURNING id, name, sort_order, active, created_at, updated_at
    `,
    [name, sort_order, active]
  );

  return rows[0];
}

export async function updateCategory(id: string, input: { name?: string; sort_order?: number; active?: boolean }) {
  const patch: any = {};
  if (input.name !== undefined) patch.name = String(input.name).trim();
  if (input.sort_order !== undefined) patch.sort_order = Number(input.sort_order);
  if (input.active !== undefined) patch.active = !!input.active;

  const keys = Object.keys(patch);
  if (!keys.length) throw new Error("Nothing to update");

  const sets: string[] = [];
  const params: any[] = [id];
  for (const k of keys) {
    params.push(patch[k]);
    sets.push(`${k} = $${params.length}`);
  }

  const rows = await query(
    `
    UPDATE categories
    SET ${sets.join(", ")}
    WHERE id = $1
    RETURNING id, name, sort_order, active, created_at, updated_at
    `,
    params
  );

  if (!rows[0]) throw new Error("Category not found");
  return rows[0];
}

export async function deleteCategory(id: string) {
  const rows = await query(`DELETE FROM categories WHERE id = $1 RETURNING id`, [id]);
  if (!rows[0]) throw new Error("Category not found");
  return { ok: true };
}