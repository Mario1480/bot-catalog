import pg from "pg";
import { env } from "./env.js";

const { Pool } = pg;

// English comment: A single pool for Postgres connections.
export const pool = new Pool({ connectionString: env.DATABASE_URL });

export async function query<T = any>(text: string, params?: any[]): Promise<T[]> {
  const res = await pool.query(text, params);
  return res.rows as T[];
}