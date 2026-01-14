import { z } from "zod";
import dotenv from "dotenv";

dotenv.config();

const EnvSchema = z.object({
  NODE_ENV: z.string().default("development"),
  PORT: z.coerce.number().default(4000),
  DATABASE_URL: z.string(),
  REDIS_URL: z.string(),
  SOLANA_RPC_URL: z.string(),
  JWT_SECRET: z.string(),
  ADMIN_JWT_SECRET: z.string(),
  COINGECKO_API_KEY: z.string().optional().default(""),
  CORS_ORIGIN: z.string().optional().default("*")
});

export const env = EnvSchema.parse(process.env);