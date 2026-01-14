import { Router } from "express";
import {
  listCategories,
  createCategory,
  updateCategory,
  deleteCategory,
} from "./categories.service.js";

export const categoriesRouter = Router();

// GET /admin/categories?includeInactive=1
categoriesRouter.get("/", async (req, res) => {
  const includeInactive =
    String(req.query.includeInactive || "") === "1" ||
    String(req.query.includeInactive || "").toLowerCase() === "true";

  const rows = await listCategories({ includeInactive });
  res.json(rows);
});

// POST /admin/categories
categoriesRouter.post("/", async (req, res) => {
  const { name, sort_order, active } = req.body ?? {};
  const created = await createCategory({ name, sort_order, active });
  res.json(created);
});

// PUT /admin/categories/:id
categoriesRouter.put("/:id", async (req, res) => {
  const id = String(req.params.id || "");
  const { name, sort_order, active } = req.body ?? {};
  const updated = await updateCategory(id, { name, sort_order, active });
  res.json(updated);
});

// DELETE /admin/categories/:id
categoriesRouter.delete("/:id", async (req, res) => {
  const id = String(req.params.id || "");
  const out = await deleteCategory(id);
  res.json(out);
});