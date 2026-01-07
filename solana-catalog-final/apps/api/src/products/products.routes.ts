import { Router } from "express";
import { listProducts, getFilters } from "./products.service.js";
import { verifyUserJwt } from "../auth/jwt.js";

export const productsRouter = Router();

function requireUser(req: any, res: any, next: any) {
  const auth = req.headers.authorization || "";
  const token = auth.startsWith("Bearer ") ? auth.slice(7) : "";
  if (!token) return res.status(401).json({ error: "Missing token" });

  try {
    req.user = verifyUserJwt(token);
    next();
  } catch {
    return res.status(401).json({ error: "Invalid token" });
  }
}

productsRouter.get("/filters", requireUser, async (_req, res) => {
  res.json(await getFilters());
});

productsRouter.get("/", requireUser, async (req, res) => {
  const search = typeof req.query.search === "string" ? req.query.search : undefined;

  // Expect filters as ?filters[key]=value
  const rawFilters = (req.query.filters ?? {}) as any;
  const filters: Record<string, string> = {};

  if (rawFilters && typeof rawFilters === "object") {
    for (const [k, v] of Object.entries(rawFilters)) {
      if (typeof v === "string") filters[k] = v;
    }
  }

  const page = req.query.page ? Number(req.query.page) : 1;
  const pageSize = req.query.pageSize ? Number(req.query.pageSize) : 12;

  res.json(await listProducts({ search, filters, page, pageSize }));
});