ALTER TABLE admins
ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT now();

-- nutzt die schon existierende Funktion set_updated_at()
DROP TRIGGER IF EXISTS trg_admins_updated_at ON admins;

CREATE TRIGGER trg_admins_updated_at
BEFORE UPDATE ON admins
FOR EACH ROW
EXECUTE PROCEDURE set_updated_at();