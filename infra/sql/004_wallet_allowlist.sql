-- English comments: Wallet allowlist (gate bypass list)

-- Ensure trigger function exists for fresh infra setups.
CREATE OR REPLACE FUNCTION set_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TABLE IF NOT EXISTS wallet_allowlist (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  pubkey TEXT NOT NULL UNIQUE,
  reason TEXT NOT NULL DEFAULT '',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

DROP TRIGGER IF EXISTS trg_wallet_allowlist_updated_at ON wallet_allowlist;

CREATE TRIGGER trg_wallet_allowlist_updated_at
BEFORE UPDATE ON wallet_allowlist
FOR EACH ROW
EXECUTE PROCEDURE set_updated_at();

CREATE INDEX IF NOT EXISTS idx_wallet_allowlist_pubkey ON wallet_allowlist(pubkey);
CREATE INDEX IF NOT EXISTS idx_wallet_allowlist_created_at ON wallet_allowlist(created_at);
