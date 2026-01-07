import { useEffect, useMemo, useState } from "react";
import { apiFetch } from "../../lib/api";

function toNumOrNull(v: any) {
  const s = String(v ?? "").trim();
  if (!s) return null;
  const n = Number(s);
  return Number.isFinite(n) ? n : null;
}

export default function GateConfigPage() {
  const [cfg, setCfg] = useState<any>(null);
  const [err, setErr] = useState("");
  const [saving, setSaving] = useState(false);
  const [loading, setLoading] = useState(true);

  const token =
    typeof window !== "undefined" ? localStorage.getItem("admin_jwt") || "" : "";

  const mode = useMemo(() => {
    if (!cfg) return "none";
    if (cfg.min_amount !== null && cfg.min_amount !== undefined) return "amount";
    if (cfg.min_usd !== null && cfg.min_usd !== undefined) return "usd";
    return "none";
  }, [cfg]);

  async function load() {
    setErr("");
    setLoading(true);
    try {
      const out = await apiFetch("/admin/gate-config", { method: "GET" }, token);
      setCfg(out);
    } catch (e: any) {
      setErr(e.message || "Failed to load");
    } finally {
      setLoading(false);
    }
  }

  async function save() {
    if (!cfg) return;
    setErr("");
    setSaving(true);

    try {
      const next = { ...cfg };

      // ensure numeric types where appropriate
      next.tolerance_percent = toNumOrNull(next.tolerance_percent) ?? 2;

      if (mode === "amount") {
        next.min_amount = toNumOrNull(next.min_amount) ?? 1;
        next.min_usd = null;
      } else if (mode === "usd") {
        next.min_usd = toNumOrNull(next.min_usd) ?? 50;
        next.min_amount = null;

        // auto fill onchain defaults
        next.coingecko_mode = next.coingecko_mode || "coin_id";
        if (next.coingecko_mode === "onchain") {
          next.coingecko_platform = next.coingecko_platform || "solana";
          next.coingecko_token_address =
            next.coingecko_token_address || next.mint_address || "";
        }
      } else {
        next.min_amount = null;
        next.min_usd = null;
      }

      const out = await apiFetch(
        "/admin/gate-config",
        { method: "PUT", body: JSON.stringify(next) },
        token
      );
      setCfg(out);
      alert("Saved");
    } catch (e: any) {
      setErr(e.message || "Save failed");
    } finally {
      setSaving(false);
    }
  }

  useEffect(() => {
    load();
  }, []);

  if (loading || !cfg) {
    return <div style={{ maxWidth: 900, margin: "40px auto", padding: 16 }}>Loading...</div>;
  }

  return (
    <div style={{ maxWidth: 900, margin: "40px auto", padding: 16, fontFamily: "system-ui" }}>
      <div style={{ display: "flex", justifyContent: "space-between", gap: 12, alignItems: "center", flexWrap: "wrap" }}>
        <h1 style={{ margin: 0 }}>Gate Configuration</h1>

        <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
          <button onClick={() => (window.location.href = "/admin")} style={{ padding: "10px 14px" }}>
            Back
          </button>
          <button onClick={save} disabled={saving} style={{ padding: "10px 14px" }}>
            {saving ? "Saving…" : "Save"}
          </button>
        </div>
      </div>

      {err && <p style={{ color: "crimson" }}>{err}</p>}

      <div style={{ display: "grid", gap: 12, marginTop: 16 }}>
        <label style={{ display: "flex", gap: 10, alignItems: "center" }}>
          <input
            type="checkbox"
            checked={!!cfg.enabled}
            onChange={(e) => setCfg({ ...cfg, enabled: e.target.checked })}
          />
          <strong>Enabled</strong>
        </label>

        <label style={{ display: "grid", gap: 6 }}>
          <div style={{ fontWeight: 700 }}>Mint Address (SPL)</div>
          <input
            value={cfg.mint_address || ""}
            onChange={(e) => setCfg({ ...cfg, mint_address: e.target.value })}
            style={{ width: "100%", padding: 10 }}
            placeholder="Solana SPL mint address"
          />
        </label>

        <label style={{ display: "grid", gap: 6 }}>
          <div style={{ fontWeight: 700 }}>Mode</div>
          <select
            value={mode}
            onChange={(e) => {
              const m = e.target.value;
              if (m === "amount") setCfg({ ...cfg, min_amount: 1, min_usd: null });
              if (m === "usd") setCfg({ ...cfg, min_amount: null, min_usd: 50 });
              if (m === "none") setCfg({ ...cfg, min_amount: null, min_usd: null });
            }}
            style={{ padding: 10, width: "100%" }}
          >
            <option value="none">None</option>
            <option value="amount">Min token amount</option>
            <option value="usd">Min USD value</option>
          </select>
        </label>

        {mode === "amount" && (
          <label style={{ display: "grid", gap: 6 }}>
            <div style={{ fontWeight: 700 }}>Min Amount</div>
            <input
              value={cfg.min_amount ?? ""}
              onChange={(e) => setCfg({ ...cfg, min_amount: e.target.value })}
              style={{ width: "100%", padding: 10 }}
              placeholder="e.g. 1"
            />
          </label>
        )}

        {mode === "usd" && (
          <>
            <label style={{ display: "grid", gap: 6 }}>
              <div style={{ fontWeight: 700 }}>Min USD</div>
              <input
                value={cfg.min_usd ?? ""}
                onChange={(e) => setCfg({ ...cfg, min_usd: e.target.value })}
                style={{ width: "100%", padding: 10 }}
                placeholder="e.g. 50"
              />
            </label>

            <label style={{ display: "grid", gap: 6 }}>
              <div style={{ fontWeight: 700 }}>CoinGecko price source</div>
              <select
                value={cfg.coingecko_mode || "coin_id"}
                onChange={(e) => setCfg({ ...cfg, coingecko_mode: e.target.value })}
                style={{ padding: 10, width: "100%" }}
              >
                <option value="coin_id">Coin ID (simple/price)</option>
                <option value="onchain">Onchain token price (platform + token address)</option>
              </select>
            </label>

            {(cfg.coingecko_mode || "coin_id") === "coin_id" && (
              <label style={{ display: "grid", gap: 6 }}>
                <div style={{ fontWeight: 700 }}>CoinGecko Coin ID</div>
                <input
                  value={cfg.coingecko_coin_id || ""}
                  onChange={(e) => setCfg({ ...cfg, coingecko_coin_id: e.target.value })}
                  style={{ width: "100%", padding: 10 }}
                  placeholder='e.g. "solana"'
                />
              </label>
            )}

            {(cfg.coingecko_mode || "coin_id") === "onchain" && (
              <>
                <label style={{ display: "grid", gap: 6 }}>
                  <div style={{ fontWeight: 700 }}>Platform</div>
                  <input
                    value={cfg.coingecko_platform || "solana"}
                    onChange={(e) => setCfg({ ...cfg, coingecko_platform: e.target.value })}
                    style={{ width: "100%", padding: 10 }}
                    placeholder="solana"
                  />
                </label>

                <label style={{ display: "grid", gap: 6 }}>
                  <div style={{ fontWeight: 700 }}>Token Address</div>
                  <input
                    value={cfg.coingecko_token_address || cfg.mint_address || ""}
                    onChange={(e) => setCfg({ ...cfg, coingecko_token_address: e.target.value })}
                    style={{ width: "100%", padding: 10 }}
                    placeholder="defaults to mint address"
                  />
                </label>
              </>
            )}
          </>
        )}

        <label style={{ display: "grid", gap: 6 }}>
          <div style={{ fontWeight: 700 }}>Tolerance Percent</div>
          <input
            value={cfg.tolerance_percent ?? 2}
            onChange={(e) => setCfg({ ...cfg, tolerance_percent: e.target.value })}
            style={{ width: "100%", padding: 10 }}
            placeholder="2"
          />
        </label>

        <div style={{ display: "flex", gap: 12, flexWrap: "wrap", marginTop: 8, opacity: 0.85 }}>
          <a href="/admin/products">Products</a>
          <a href="/admin/csv">CSV Import/Export</a>
        </div>
      </div>
    </div>
  );
}