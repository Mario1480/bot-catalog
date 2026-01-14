import { Request, Response, NextFunction } from "express";
import { verifyAdminJwt } from "./jwt.js";

export function requireAdmin(req: Request, res: Response, next: NextFunction) {
  // English comment: Expect Bearer admin token.
  const auth = req.headers.authorization || "";
  const token = auth.startsWith("Bearer ") ? auth.slice(7) : "";
  if (!token) return res.status(401).json({ error: "Missing admin token" });

  try {
    (req as any).admin = verifyAdminJwt(token);
    next();
  } catch {
    return res.status(401).json({ error: "Invalid admin token" });
  }
}