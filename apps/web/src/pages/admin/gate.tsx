import { useEffect, useState } from "react";
import { apiFetch } from "../../lib/api";

export default function GateConfigPage() {
  const [cfg, setCfg] = useState<any>(null);
  const [err, setErr] = useState("");

  const token = typeof window !== "undefined" ? localStorage.getItem("admin_jwt") || "" : "";

  async function load() {
    setErr("");
    try {
      const out = await apiFetch("/admin/gate-config", { method: "GET" }, token);
      setCfg(out);
    } catch (e: any) {
      setErr(e.message || "Failed");
    }
  }

  async function save() {
    setErr("");
    try {
      // English comment: Auto-fill token address for onchain mode if missing.
      const next = { ...cfg };
      if (next.coingecko_mode === "onchain") {
        next.coingecko_platform = next.coingecko_platform || "solana";
        next.coingecko_token_address = next.coingecko_token_address || next.mint_address;
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
    }
  }

  useEffect(() => {
    load();
  }, []);

  if (!cfg) return <div style={{ maxWidth: 720, margin: "40px auto" }}>Loading...</div>;

  return (
    <div style={{ maxWidth: 720, margin: "40px auto", padding: 16, fontFamily: "system-ui" }}>
      <h1>Gate Configuration</h1>
      {err && <p style={{ color: "crimson" }}>{err}</p>}

      <label style={{ display: "block", marginTop: 12 }}>
        <input
          type="checkbox"
          checked={!!cfg.enabled}
          onChange={(e) => setCfg({ ...cfg, enabled: e.target.checked })}
        />{" "}
        Enabled
      </label>

      <div style={{ marginTop: 12 }}>
        <div>Mint Address (SPL)</div>
        <input
          value={cfg.mint_address || ""}
          onChange={(e) => setCfg({ ...cfg, mint_address: e.target.value })}
          style={{ width: "100%", padding: 10 }}
        />
      </div>

      <div style={{ marginTop: 12 }}>
        <div>Mode</div>
        <select
          value={cfg.min_amount !== null ? "amount" : cfg.min_usd !== null ? "usd" : "none"}
          onChange={(e) => {
            const mode = e.target.value;
            if (mode === "amount") setCfg({ ...cfg, min_amount: 1, min_usd: null });
            if (mode === "usd") setCfg({ ...cfg, min_amount: null, min_usd: 50 });
            if (mode === "none") setCfg({ ...cfg, min_amount: null, min_usd: null });
          }}
          style={{ padding: 10, width: "100%" }}
        >
          <option value="none">Not set yet</option>
          <option value="amount">Min token amount</option>
          <option value="usd">Min USD value</option>
        </select>
      </div>

      {cfg.min_amount !== null && (
        <div style={{ marginTop: 12 }}>
          <div>Min Amount</div>
          <input
            value={cfg.min_amount}
            onChange={(e) => setCfg({ ...cfg, min_amount: e.target.value })}
            style={{ width: "100%", padding: 10 }}
          />
        </div>
      )}

      {cfg.min_usd !== null && (
        <>
          <div style={{ marginTop: 12 }}>
            <div>Min USD</div>
            <input
              value={cfg.min_usd}
              onChange={(e) => setCfg({ ...cfg, min_usd: e.target.value })}
              style={{ width: "100%", padding: 10 }}
            />
          </div>

          <div style={{ marginTop: 12 }}>
            <div>CoinGecko price source</div>
            <select
              value={cfg.coingecko_mode || "coin_id"}
              onChange={(e) => setCfg({ ...cfg, coingecko_mode: e.target.value })}
              style={{ padding: 10, width: "100%" }}
            >
              <option value="coin_id">Coin ID (simple/price)</option>
              <option value="onchain">Onchain token price (platform + token address)</option>
            </select>
          </div>

          {cfg.coingecko_mode === "coin_id" && (
            <div style={{ marginTop: 12 }}>
              <div>CoinGecko Coin ID</div>
              <input
                value={cfg.coingecko_coin_id || ""}
                onChange={(e) => setCfg({ ...cfg, coingecko_coin_id: e.target.value })}
                style={{ width: "100%", padding: 10 }}
                placeholder='e.g. "solana"'
              />
            </div>
          )}

          {cfg.coingecko_mode === "onchain" && (
            <>
              <div style={{ marginTop: 12 }}>
                <div>Platform</div>
                <input
                  value={cfg.coingecko_platform || "solana"}
                  onChange={(e) => setCfg({ ...cfg, coingecko_platform: e.target.value })}
                  style={{ width: "100%", padding: 10 }}
                />
              </div>
              <div style={{ marginTop: 12 }}>
                <div>Token Address</div>
                <input
                  value={cfg.coingecko_token_address || cfg.mint_address || ""}
                  onChange={(e) => setCfg({ ...cfg, coingecko_token_address: e.target.value })}
                  style={{ width: "100%", padding: 10 }}
                />
              </div>
            </>
          )}
        </>
      )}

      <div style={{ marginTop: 12 }}>
        <div>Tolerance Percent (default 2)</div>
        <input
          value={cfg.tolerance_percent ?? 2}
          onChange={(e) => setCfg({ ...cfg, tolerance_percent: e.target.value })}
          style={{ width: "100%", padding: 10 }}
        />
      </div>

      <button onClick={save} style={{ padding: "10px 14px", marginTop: 16, width: "100%" }}>
        Save
      </button>

      <hr style={{ margin: "24px 0" }} />
      <div style={{ display: "flex", gap: 12 }}>
        <a href="/admin/products">Products CRUD</a>
        <a href="/admin/csv">CSV Import/Export</a>
      </div>
    </div>
  );
}