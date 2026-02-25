-- =========================
-- Wallet allowlist
-- =========================
CREATE TABLE IF NOT EXISTS wallet_allowlist (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  pubkey TEXT NOT NULL UNIQUE,
  reason TEXT NOT NULL DEFAULT '',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- =========================
-- Auto-update updated_at
-- =========================
DROP TRIGGER IF EXISTS trg_wallet_allowlist_updated_at ON wallet_allowlist;

CREATE TRIGGER trg_wallet_allowlist_updated_at
BEFORE UPDATE ON wallet_allowlist
FOR EACH ROW
EXECUTE PROCEDURE set_updated_at();

-- =========================
-- Helpful indexes
-- =========================
CREATE INDEX IF NOT EXISTS idx_wallet_allowlist_pubkey ON wallet_allowlist(pubkey);
CREATE INDEX IF NOT EXISTS idx_wallet_allowlist_created_at ON wallet_allowlist(created_at);
