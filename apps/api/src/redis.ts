import { createClient } from "redis";
import { env } from "./env.js";

// English comment: Redis is used for caching CoinGecko prices.
export const redis = createClient({ url: env.REDIS_URL });

export async function initRedis() {
  if (!redis.isOpen) await redis.connect();
}