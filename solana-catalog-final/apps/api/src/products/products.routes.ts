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

// Returns available filters (categories, tags, field keys)
productsRouter.get("/filters", requireUser, async (_req, res) => {
  res.json(await getFilters());
});

productsRouter.get("/", requireUser, async (req, res) => {
  // support both ?search= and ?q=
  const search =
    typeof req.query.search === "string"
      ? req.query.search
      : typeof req.query.q === "string"
      ? req.query.q
      : undefined;

  // Expect filters as ?filters[key]=value (Next.js style)
  const rawFilters = (req.query.filters ?? {}) as any;
  const filters: Record<string, string | string[]> = {};

  if (rawFilters && typeof rawFilters === "object") {
    for (const [k, v] of Object.entries(rawFilters)) {
      if (typeof v === "string") filters[k] = v;
      if (Array.isArray(v)) filters[k] = v.map(String);
    }
  }

  // paging
  const page = req.query.page ? Number(req.query.page) : 1;
  const pageSize =
    req.query.pageSize ? Number(req.query.pageSize) :
    req.query.limit ? Number(req.query.limit) :
    50;

  res.json(await listProducts({ search, filters, page, pageSize }));
});