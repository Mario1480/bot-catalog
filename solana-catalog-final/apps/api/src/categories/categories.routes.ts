import { Router } from "express";
import { verifyAdminJwt } from "../auth/jwt.js";
import { createCategory, deleteCategory, listCategories } from "./categories.service.js";

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

categoriesRouter.get("/", requireAdmin, async (_req, res) => {
  res.json(await listCategories());
});

categoriesRouter.post("/", requireAdmin, async (req, res) => {
  const name = String(req.body?.name || "").trim();
  if (!name) return res.status(400).json({ error: "Missing name" });

  const out = await createCategory(name);
  res.json(out);
});

categoriesRouter.delete("/:id", requireAdmin, async (req, res) => {
  const id = String(req.params.id || "");
  if (!id) return res.status(400).json({ error: "Missing id" });

  await deleteCategory(id);
  res.json({ ok: true });
});