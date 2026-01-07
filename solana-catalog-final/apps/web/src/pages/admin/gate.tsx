import { useEffect, useState } from "react";
import Link from "next/link";
import { apiFetch } from "../../lib/api";
import { AdminLayout } from "../../components/admin/AdminLayout";

export default function GateConfigPage() {
  const [cfg, setCfg] = useState<any>(null);
  const [err, setErr] = useState("");
  const [saving, setSaving] = useState(false);

  const token =
    typeof window !== "undefined" ? localStorage.getItem("admin_jwt") || "" : "";

  async function load() {
    setErr("");
    try {
      const out = await apiFetch("/admin/gate-config", { method: "GET" }, token);
      setCfg(out);
    } catch (e: any) {
      setErr(e?.message || "Failed to load gate config");
    }
  }

  async function save() {
    if (!cfg) return;
    setErr("");
    setSaving(true);
    try {
      // Auto-fill token address for onchain mode if missing.
      const next = { ...cfg };
      if (next.coingecko_mode === "onchain") {
        next.coingecko_platform = next.coingecko_platform || "solana";
        next.coingecko_token_address =
          next.coingecko_token_address || next.mint_address;
      }

      const out = await apiFetch(
        "/admin/gate-config",
        { method: "PUT", body: JSON.stringify(next) },
        token
      );

      setCfg(out);
      alert("Saved");
    } catch (e: any) {
      setErr(e?.message || "Save failed");
    } finally {
      setSaving(false);
    }
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <AdminLayout title="Token gating">
      {err && (
        <div
          className="card"
          style={{
            padding: 14,
            marginBottom: 14,
            borderColor: "rgba(255,80,80,.35)",
            background: "rgba(255,80,80,.08)",
          }}
        >
          <div style={{ fontWeight: 900 }}>Error</div>
          <div style={{ color: "var(--muted)", marginTop: 6 }}>{err}</div>
        </div>
      )}

      {!cfg ? (
        <div className="card" style={{ padding: 16 }}>
          Loading…
        </div>
      ) : (
        <div style={{ display: "grid", gap: 14 }}>
          <div
            className="card"
            style={{ padding: 16, display: "grid", gap: 12 }}
          >
            <div style={{ fontWeight: 900 }}>Gate configuration</div>

            <label style={{ display: "flex", gap: 10, alignItems: "center" }}>
              <input
                type="checkbox"
                checked={!!cfg.enabled}
                onChange={(e) => setCfg({ ...cfg, enabled: e.target.checked })}
              />
              <span>Enabled</span>
            </label>

            <div>
              <div style={{ fontSize: 12, color: "var(--muted)", marginBottom: 6 }}>
                Mint Address (SPL)
              </div>
              <input
                className="input"
                value={cfg.mint_address || ""}
                onChange={(e) =>
                  setCfg({ ...cfg, mint_address: e.target.value })
                }
              />
            </div>

            <div>
              <div style={{ fontSize: 12, color: "var(--muted)", marginBottom: 6 }}>
                Mode
              </div>
              <select
                className="input"
                value={
                  cfg.min_amount !== null
                    ? "amount"
                    : cfg.min_usd !== null
                    ? "usd"
                    : "none"
                }
                onChange={(e) => {
                  const mode = e.target.value;
                  if (mode === "amount")
                    setCfg({ ...cfg, min_amount: 1, min_usd: null });
                  if (mode === "usd")
                    setCfg({ ...cfg, min_amount: null, min_usd: 50 });
                  if (mode === "none")
                    setCfg({ ...cfg, min_amount: null, min_usd: null });
                }}
              >
                <option value="none">Not set yet</option>
                <option value="amount">Min token amount</option>
                <option value="usd">Min USD value</option>
              </select>
            </div>

            {cfg.min_amount !== null && (
              <div>
                <div style={{ fontSize: 12, color: "var(--muted)", marginBottom: 6 }}>
                  Min Amount
                </div>
                <input
                  className="input"
                  value={cfg.min_amount ?? ""}
                  onChange={(e) =>
                    setCfg({ ...cfg, min_amount: e.target.value })
                  }
                />
              </div>
            )}

            {cfg.min_usd !== null && (
              <div style={{ display: "grid", gap: 12 }}>
                <div>
                  <div style={{ fontSize: 12, color: "var(--muted)", marginBottom: 6 }}>
                    Min USD
                  </div>
                  <input
                    className="input"
                    value={cfg.min_usd ?? ""}
                    onChange={(e) => setCfg({ ...cfg, min_usd: e.target.value })}
                  />
                </div>

                <div>
                  <div style={{ fontSize: 12, color: "var(--muted)", marginBottom: 6 }}>
                    CoinGecko price source
                  </div>
                  <select
                    className="input"
                    value={cfg.coingecko_mode || "coin_id"}
                    onChange={(e) =>
                      setCfg({ ...cfg, coingecko_mode: e.target.value })
                    }
                  >
                    <option value="coin_id">Coin ID (simple/price)</option>
                    <option value="onchain">
                      Onchain token price (platform + token address)
                    </option>
                  </select>
                </div>

                {cfg.coingecko_mode === "coin_id" && (
                  <div>
                    <div style={{ fontSize: 12, color: "var(--muted)", marginBottom: 6 }}>
                      CoinGecko Coin ID
                    </div>
                    <input
                      className="input"
                      value={cfg.coingecko_coin_id || ""}
                      onChange={(e) =>
                        setCfg({ ...cfg, coingecko_coin_id: e.target.value })
                      }
                      placeholder='e.g. "solana"'
                    />
                  </div>
                )}

                {cfg.coingecko_mode === "onchain" && (
                  <>
                    <div>
                      <div style={{ fontSize: 12, color: "var(--muted)", marginBottom: 6 }}>
                        Platform
                      </div>
                      <input
                        className="input"
                        value={cfg.coingecko_platform || "solana"}
                        onChange={(e) =>
                          setCfg({
                            ...cfg,
                            coingecko_platform: e.target.value,
                          })
                        }
                      />
                    </div>

                    <div>
                      <div style={{ fontSize: 12, color: "var(--muted)", marginBottom: 6 }}>
                        Token Address
                      </div>
                      <input
                        className="input"
                        value={
                          cfg.coingecko_token_address ||
                          cfg.mint_address ||
                          ""
                        }
                        onChange={(e) =>
                          setCfg({
                            ...cfg,
                            coingecko_token_address: e.target.value,
                          })
                        }
                      />
                    </div>
                  </>
                )}
              </div>
            )}

            <div>
              <div style={{ fontSize: 12, color: "var(--muted)", marginBottom: 6 }}>
                Tolerance Percent (default 2)
              </div>
              <input
                className="input"
                value={cfg.tolerance_percent ?? 2}
                onChange={(e) =>
                  setCfg({ ...cfg, tolerance_percent: e.target.value })
                }
              />
            </div>

            <button
              className="btn btnPrimary"
              onClick={save}
              disabled={saving}
              style={{ width: "100%" }}
            >
              {saving ? "Saving…" : "Save"}
            </button>
          </div>

          <div
            className="card"
            style={{
              padding: 14,
              display: "flex",
              gap: 10,
              flexWrap: "wrap",
              alignItems: "center",
            }}
          >
            <Link className="btn" href="/admin/products">
              Products
            </Link>
            <Link className="btn" href="/admin/csv">
              CSV Import/Export
            </Link>
          </div>
        </div>
      )}
    </AdminLayout>
  );
}