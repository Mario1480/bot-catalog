import { Router } from "express";
import type { NextFunction, Request, Response } from "express";
import {
  listProducts,
  getFilters,
  listFavoriteProductIds,
  addFavorite,
  removeFavorite,
} from "./products.service.js";
import { verifyUserJwt } from "../auth/jwt.js";

export const productsRouter = Router();

function requireUser(req: Request, res: Response, next: NextFunction) {
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

productsRouter.get("/favorites", requireUser, async (req: Request, res: Response) => {
  const pubkey = String(req.user?.pubkey || "");
  if (!pubkey) return res.status(401).json({ error: "Invalid token" });

  res.json(await listFavoriteProductIds(pubkey));
});

productsRouter.post(
  "/:id([0-9a-fA-F-]{36})/favorite",
  requireUser,
  async (req: Request, res: Response) => {
    const pubkey = String(req.user?.pubkey || "");
    if (!pubkey) return res.status(401).json({ error: "Invalid token" });

    try {
      res.json(await addFavorite(pubkey, String(req.params.id)));
    } catch (e: any) {
      res.status(404).json({ error: e?.message || "Product not found" });
    }
  });

productsRouter.delete(
  "/:id([0-9a-fA-F-]{36})/favorite",
  requireUser,
  async (req: Request, res: Response) => {
    const pubkey = String(req.user?.pubkey || "");
    if (!pubkey) return res.status(401).json({ error: "Invalid token" });

    res.json(await removeFavorite(pubkey, String(req.params.id)));
  });

productsRouter.get("/", requireUser, async (req: Request, res: Response) => {
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
