import { Router } from "express";
import { verifyAdminJwt } from "../auth/jwt.js";
import {
  listCategories,
  createCategory,
  updateCategory,
  deleteCategory,
} from "./categories.service.js";

export const categoriesRouter = Router();

function requireAdmin(req: any, res: any, next: any) {
  const auth = req.headers.authorization || "";
  const token = auth.startsWith("Bearer ") ? auth.slice(7) : "";
  if (!token) return res.status(401).json({ error: "Missing token" });

  try {
    req.admin = verifyAdminJwt(token);
    next();
  } catch {
    return res.status(401).json({ error: "Invalid token" });
  }
}

/**
 * Admin list (includes inactive)
 */
categoriesRouter.get("/", requireAdmin, async (_req, res) => {
  res.json(await listCategories({ includeInactive: true }));
});

categoriesRouter.post("/", requireAdmin, async (req, res) => {
  res.json(await createCategory(req.body || {}));
});

categoriesRouter.put("/:id", requireAdmin, async (req, res) => {
  res.json(await updateCategory(req.params.id, req.body || {}));
});

categoriesRouter.delete("/:id", requireAdmin, async (req, res) => {
  res.json(await deleteCategory(req.params.id));
});