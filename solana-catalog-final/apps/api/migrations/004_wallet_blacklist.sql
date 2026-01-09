-- =========================
-- Wallet blacklist
-- =========================
CREATE TABLE IF NOT EXISTS wallet_blacklist (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  pubkey TEXT NOT NULL UNIQUE,
  reason TEXT NOT NULL DEFAULT '',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- =========================
-- Auto-update updated_at
-- =========================
DROP TRIGGER IF EXISTS trg_wallet_blacklist_updated_at ON wallet_blacklist;

CREATE TRIGGER trg_wallet_blacklist_updated_at
BEFORE UPDATE ON wallet_blacklist
FOR EACH ROW
EXECUTE PROCEDURE set_updated_at();

-- =========================
-- Helpful indexes
-- =========================
CREATE INDEX IF NOT EXISTS idx_wallet_blacklist_pubkey ON wallet_blacklist(pubkey);
CREATE INDEX IF NOT EXISTS idx_wallet_blacklist_created_at ON wallet_blacklist(created_at);
