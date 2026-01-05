-- English comments: Initial schema for catalog + gating + admin

CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Products
CREATE TABLE IF NOT EXISTS products (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  title text NOT NULL,
  description text NOT NULL DEFAULT '',
  image_url text NOT NULL DEFAULT '',
  target_url text NOT NULL,
  status text NOT NULL DEFAULT 'published',
  search_extra text NOT NULL DEFAULT '',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- Unique constraint for simple upsert logic
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'uq_products_target_url'
  ) THEN
    ALTER TABLE products ADD CONSTRAINT uq_products_target_url UNIQUE (target_url);
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_products_status ON products(status);

-- Dynamic fields for filtering
CREATE TABLE IF NOT EXISTS product_fields (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  product_id uuid NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  key text NOT NULL,
  value text NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_product_fields_product ON product_fields(product_id);
CREATE INDEX IF NOT EXISTS idx_product_fields_key_value ON product_fields(key, value);

-- Optional tags
CREATE TABLE IF NOT EXISTS product_tags (
  product_id uuid NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  tag text NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_product_tags_tag ON product_tags(tag);

-- Admin users
CREATE TABLE IF NOT EXISTS admins (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  email text NOT NULL UNIQUE,
  password_hash text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- Nonces for wallet sign-in
CREATE TABLE IF NOT EXISTS auth_nonces (
  pubkey text PRIMARY KEY,
  nonce text NOT NULL,
  expires_at timestamptz NOT NULL
);

-- Tokengating configuration editable in admin panel
CREATE TABLE IF NOT EXISTS gate_config (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  enabled boolean NOT NULL DEFAULT true,
  mint_address text NOT NULL DEFAULT '',
  min_amount numeric NULL,
  min_usd numeric NULL,
  tolerance_percent numeric NOT NULL DEFAULT 2.0,

  -- CoinGecko config
  coingecko_mode text NOT NULL DEFAULT 'coin_id', -- coin_id|onchain
  coingecko_coin_id text NULL,
  coingecko_platform text NULL, -- e.g. solana
  coingecko_token_address text NULL, -- e.g. SPL mint

  updated_at timestamptz NOT NULL DEFAULT now()
);

-- Keep exactly one row
INSERT INTO gate_config (enabled, mint_address)
SELECT true, ''
WHERE NOT EXISTS (SELECT 1 FROM gate_config);

-- Gate state for hysteresis
CREATE TABLE IF NOT EXISTS gate_state (
  pubkey text PRIMARY KEY,
  last_status boolean NOT NULL DEFAULT false,
  last_value_usd numeric NULL,
  updated_at timestamptz NOT NULL DEFAULT now()
);
