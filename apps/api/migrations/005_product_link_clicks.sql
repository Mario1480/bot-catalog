-- =========================
-- Product link clicks
-- =========================
CREATE TABLE IF NOT EXISTS product_link_clicks (
  product_id UUID PRIMARY KEY REFERENCES products(id) ON DELETE CASCADE,
  clicks BIGINT NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- =========================
-- Auto-update updated_at
-- =========================
DROP TRIGGER IF EXISTS trg_product_link_clicks_updated_at ON product_link_clicks;

CREATE TRIGGER trg_product_link_clicks_updated_at
BEFORE UPDATE ON product_link_clicks
FOR EACH ROW
EXECUTE PROCEDURE set_updated_at();

-- =========================
-- Helpful indexes
-- =========================
CREATE INDEX IF NOT EXISTS idx_product_link_clicks_clicks ON product_link_clicks(clicks);
