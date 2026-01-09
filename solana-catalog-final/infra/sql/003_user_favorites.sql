-- English comments: User favorites tied to wallet pubkey.

CREATE TABLE IF NOT EXISTS user_favorites (
  pubkey text NOT NULL,
  product_id uuid NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (pubkey, product_id)
);

CREATE INDEX IF NOT EXISTS idx_user_favorites_pubkey ON user_favorites(pubkey);
