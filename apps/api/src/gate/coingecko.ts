import fetch from "node-fetch";
import { env } from "../env.js";
import { redis } from "../redis.js";

type PriceMode = "coin_id" | "onchain";

export async function getUsdPriceFromCoinGecko(opts: {
  mode: PriceMode;
  coinId?: string | null;
  platform?: string | null;
  tokenAddress?: string | null;
}): Promise<number> {
  const mode = opts.mode;

  const cacheKey =
    mode === "coin_id"
      ? `cg:price:coin:${opts.coinId}:usd`
      : `cg:price:onchain:${opts.platform}:${opts.tokenAddress}:usd`;

  const cached = await redis.get(cacheKey);
  if (cached) return Number(cached);

  const headers: Record<string, string> = {};
  // English comment: CoinGecko demo API key header (optional).
  if (env.COINGECKO_API_KEY) headers["x-cg-demo-api-key"] = env.COINGECKO_API_KEY;

  let price: number | null = null;

  if (mode === "coin_id") {
    if (!opts.coinId) throw new Error("Missing CoinGecko coin id");
    const url = new URL("https://api.coingecko.com/api/v3/simple/price");
    url.searchParams.set("ids", opts.coinId);
    url.searchParams.set("vs_currencies", "usd");

    const resp = await fetch(url.toString(), { headers });
    if (!resp.ok) throw new Error(`CoinGecko error: ${resp.status}`);
    const data: any = await resp.json();

    price = Number(data?.[opts.coinId]?.usd);
  } else {
    // English comment: Token price by contract address (CoinGecko: /simple/token_price/{platform}).
    const platform = (opts.platform || "solana").trim();
    const addr = (opts.tokenAddress || "").trim();
    if (!addr) throw new Error("Missing token address for onchain mode");

    const url = new URL(`https://api.coingecko.com/api/v3/simple/token_price/${platform}`);
    url.searchParams.set("contract_addresses", addr);
    url.searchParams.set("vs_currencies", "usd");

    const resp = await fetch(url.toString(), { headers });
    if (!resp.ok) throw new Error(`CoinGecko error: ${resp.status}`);
    const data: any = await resp.json();

    // CoinGecko returns a map keyed by lowercase contract address.
    price = Number(data?.[addr.toLowerCase()]?.usd);
  }

  if (!Number.isFinite(price) || (price ?? 0) <= 0) throw new Error("Invalid CoinGecko price");

  // English comment: Cache for 60 seconds.
  await redis.set(cacheKey, String(price), { EX: 60 });
  return price!;
}