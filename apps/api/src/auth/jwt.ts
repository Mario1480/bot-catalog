import jwt from "jsonwebtoken";
import { env } from "../env.js";

export function signUserJwt(pubkey: string) {
  // English comment: Short-lived user session token.
  return jwt.sign({ pubkey }, env.JWT_SECRET, { expiresIn: "1h" });
}

export function verifyUserJwt(token: string): { pubkey: string } {
  return jwt.verify(token, env.JWT_SECRET) as any;
}

export function signAdminJwt(adminId: string, email: string) {
  return jwt.sign({ adminId, email }, env.ADMIN_JWT_SECRET, { expiresIn: "6h" });
}

export function verifyAdminJwt(token: string): { adminId: string; email: string } {
  return jwt.verify(token, env.ADMIN_JWT_SECRET) as any;
}