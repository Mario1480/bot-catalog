import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { apiFetch } from "../../lib/api";
import { AdminLayout } from "../../components/admin/AdminLayout";

function isAuthErrorMessage(msg: string) {
  const m = (msg || "").toLowerCase();
  return (
    m.includes("unauthorized") ||
    m.includes("invalid token") ||
    m.includes("jwt") ||
    m.includes("token expired") ||
    m.includes("forbidden") ||
    m.includes("status 401") ||
    m.includes("status 403")
  );
}

type GateConfig = {
  enabled?: boolean;
  mint_address?: string;
  min_amount?: number | null;
  min_usd?: number | null;
  coingecko_mode?: string | null;
  updated_at?: string;
};

type Category = {
  id: string;
  name: string;
  sort_order: number;
  active: boolean;
  updated_at?: string;
};

type ProductRow = {
  id: string;
  title: string;
  status: string;
  updated_at?: string;
};

export default function AdminDashboardPage() {
  const token =
    typeof window !== "undefined" ? localStorage.getItem("admin_jwt") || "" : "";

  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState("");

  const [gate, setGate] = useState<GateConfig | null>(null);
  const [categories, setCategories] = useState<Category[]>([]);
  const [productStats, setProductStats] = useState<any>(null);
  const [gatePreview, setGatePreview] = useState<any>(null);
  const [gateErr, setGateErr] = useState("");
  const [status, setStatus] = useState<any>(null);
  const [statusErr, setStatusErr] = useState("");
  const [analytics, setAnalytics] = useState<any>(null);
  const [analyticsErr, setAnalyticsErr] = useState("");

  async function loadGatePreview() {
    setGateErr("");
    try {
      const out = await apiFetch("/admin/gate-preview", { method: "GET" }, token);
      setGatePreview(out);
    } catch (e: any) {
      setGateErr(e?.message || "Failed to load gate preview");
    }
  }

  async function loadStatus() {
    setStatusErr("");
    try {
      const out = await apiFetch("/admin/status", { method: "GET" }, token);
      setStatus(out);
    } catch (e: any) {
      setStatusErr(e?.message || "Failed to load status");
    }
  }

  async function loadAnalytics() {
    setAnalyticsErr("");
    try {
      const out = await apiFetch("/admin/user-analytics", { method: "GET" }, token);
      setAnalytics(out);
    } catch (e: any) {
      setAnalyticsErr(e?.message || "Failed to load user analytics");
    }
  }

  useEffect(() => {
    loadGatePreview();
    loadStatus();
    loadAnalytics();
  }, []);

  useEffect(() => {
    if (typeof window === "undefined") return;

    if (!token) {
      window.location.href = "/admin/login";
      return;
    }

    (async () => {
      setLoading(true);
      setErr("");

      try {
        // parallel laden
        // Load all products for dashboard statistics (until a /admin/products/count endpoint exists)
        const [gateOut, catsOut, prodStatsOut] = await Promise.all([
          apiFetch("/admin/gate-config", { method: "GET" }, token),
          apiFetch("/admin/categories?includeInactive=1", { method: "GET" }, token),
          apiFetch("/admin/products/stats", { method: "GET" }, token),
        ]);

        setGate(gateOut || null);
        setCategories(Array.isArray(catsOut) ? catsOut : []);
        setProductStats(prodStatsOut || null);
      } catch (e: any) {
        const msg = (e?.message || "Failed to load dashboard").toString();
        setErr(msg);

        if (isAuthErrorMessage(msg)) {
          try {
            localStorage.removeItem("admin_jwt");
          } catch {}
          window.location.href = "/admin/login";
        }
      } finally {
        setLoading(false);
      }
    })();
  }, [token]);

  const stats = useMemo(() => {
    const totalCategories = categories.length;
    const activeCategories = categories.filter((c) => c.active).length;

    const totalProducts = productStats?.total ?? 0;
    const publishedProducts = productStats?.published ?? 0;
    const draftProducts = productStats?.draft ?? 0;

    const gateEnabled = !!gate?.enabled;
    const gateMode =
      gate?.min_amount != null ? "Min Amount" : gate?.min_usd != null ? "Min USD" : "Not set";
    const gateExtra =
      gate?.min_amount != null
        ? `≥ ${gate.min_amount}`
        : gate?.min_usd != null
        ? `≥ $${gate.min_usd}`
        : "";

    return {
      totalCategories,
      activeCategories,
      totalProducts,
      publishedProducts,
      draftProducts,
      gateEnabled,
      gateMode,
      gateExtra,
    };
  }, [categories, productStats, gate]);

  return (
    <AdminLayout title="Admin Dashboard">
      <div className="container" style={{ maxWidth: 1100 }}>
        {err ? (
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
        ) : null}

        {loading ? (
          <div className="card" style={{ padding: 16 }}>
            Loading…
          </div>
        ) : (
          <>
            <div
              style={{
                display: "grid",
                gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))",
                gap: 14,
              }}
            >
              {/* Gate */}
              <div className="card" style={{ padding: 16 }}>
                <div style={{ display: "flex", justifyContent: "space-between", gap: 10 }}>
                  <div style={{ fontWeight: 900, fontSize: 16 }}>Token Gating</div>
                  <span
                    className="badge"
                    style={{
                      background: stats.gateEnabled ? "rgba(0,255,160,.12)" : "rgba(255,80,80,.10)",
                      borderColor: stats.gateEnabled ? "rgba(0,255,160,.25)" : "rgba(255,80,80,.25)",
                    }}
                  >
                    <span className="badgeDot" />
                    {stats.gateEnabled ? "Enabled" : "Disabled"}
                  </span>
                </div>

                <div style={{ marginTop: 10, color: "var(--muted)", fontSize: 13 }}>
                  Mode: <span style={{ color: "var(--text)" }}>{stats.gateMode}</span>{" "}
                  {stats.gateExtra ? (
                    <span style={{ color: "var(--text)", opacity: 0.9 }}>({stats.gateExtra})</span>
                  ) : null}
                </div>

                <div style={{ marginTop: 12 }}>
                  <Link className="btn btnPrimary" href="/admin/gate" style={{ width: "100%" as any }}>
                    Open Token Gating
                  </Link>
                </div>
                {gateErr ? (
                  <div style={{ marginTop: 10, opacity: 0.85 }}>
                    <span style={{ color: "#ff6b6b" }}>{gateErr}</span>
                  </div>
                ) : gatePreview ? (
                  <div style={{ marginTop: 10, opacity: 0.85, fontSize: 13, lineHeight: 1.4 }}>
                    {gatePreview.priceUsd ? (
                      <div>Price: ${Number(gatePreview.priceUsd).toFixed(6)}</div>
                    ) : (
                      <div>Price: (not available)</div>
                    )}

                    {gatePreview.mode === "usd" && gatePreview.requiredTokens ? (
                      <div>
                        Required: {Number(gatePreview.requiredTokens).toFixed(4)} tokens{" "}
                        (≈ ${Number(gatePreview.requiredUsd || gatePreview.min_usd || 0).toFixed(2)})
                      </div>
                    ) : null}

                    {gatePreview.mode === "amount" && gatePreview.requiredTokens ? (
                      <div>
                        Required: {Number(gatePreview.requiredTokens).toFixed(4)} tokens
                        {gatePreview.requiredUsd ? (
                          <> (≈ ${Number(gatePreview.requiredUsd).toFixed(2)})</>
                        ) : null}
                      </div>
                    ) : null}
                  </div>
                ) : (
                  <div style={{ marginTop: 10, opacity: 0.75, fontSize: 13 }}>Loading price…</div>
                )}
              </div>

              {/* Categories */}
              <div className="card" style={{ padding: 16 }}>
                <div style={{ fontWeight: 900, fontSize: 16 }}>Categories</div>
                <div style={{ marginTop: 10, color: "var(--muted)", fontSize: 13 }}>
                  Active: <span style={{ color: "var(--text)" }}>{stats.activeCategories}</span>
                  <br />
                  Total: <span style={{ color: "var(--text)" }}>{stats.totalCategories}</span>
                </div>

                <div style={{ marginTop: 12 }}>
                  <Link className="btn" href="/admin/categories" style={{ width: "100%" as any }}>
                    Manage Categories
                  </Link>
                </div>
              </div>

              {/* Products */}
              <div className="card" style={{ padding: 16 }}>
                <div style={{ fontWeight: 900, fontSize: 16 }}>Products</div>
                <div style={{ marginTop: 10, color: "var(--muted)", fontSize: 13 }}>
                  Total: <span style={{ color: "var(--text)" }}>{stats.totalProducts}</span>
                  <br />
                  Published: <span style={{ color: "var(--text)" }}>{stats.publishedProducts}</span>{" "}
                  · Draft: <span style={{ color: "var(--text)" }}>{stats.draftProducts}</span>
                </div>

                <div style={{ marginTop: 12, display: "grid", gap: 10 }}>
                  <Link className="btn" href="/admin/products" style={{ width: "100%" as any }}>
                    Open Products
                  </Link>
                  <Link className="btn btnPrimary" href="/admin/products-edit" style={{ width: "100%" as any }}>
                    + Create Product
                  </Link>
                </div>
              </div>

              {/* Health / Status */}
              <div className="card" style={{ padding: 16 }}>
                <div style={{ fontWeight: 900, fontSize: 16 }}>Health / Status</div>

                {statusErr ? (
                  <div style={{ marginTop: 10, color: "#ff6b6b", fontSize: 13 }}>{statusErr}</div>
                ) : status ? (
                  <div style={{ marginTop: 10, color: "var(--muted)", fontSize: 13, lineHeight: 1.5 }}>
                    <div>
                      API: <span style={{ color: "var(--text)" }}>{"OK"}</span> · Uptime:{" "}
                      <span style={{ color: "var(--text)" }}>{Math.floor(Number(status.uptimeSec || 0) / 60)}m</span>
                    </div>
                    <div>
                      DB:{" "}
                      <span style={{ color: "var(--text)" }}>{status.dbOk ? "OK" : "DOWN"}</span> · Redis:{" "}
                      <span style={{ color: "var(--text)" }}>{status.redisOk ? "OK" : "DOWN"}</span>
                    </div>
                  </div>
                ) : (
                  <div style={{ marginTop: 10, opacity: 0.75, fontSize: 13 }}>Loading…</div>
                )}

                <div style={{ marginTop: 12, borderTop: "1px solid var(--border)", paddingTop: 12 }}>
                  <div style={{ fontWeight: 800, fontSize: 13 }}>User analytics (wallet logins)</div>

                  {analyticsErr ? (
                    <div style={{ marginTop: 8, color: "#ff6b6b", fontSize: 13 }}>{analyticsErr}</div>
                  ) : analytics ? (
                    <div style={{ marginTop: 8, color: "var(--muted)", fontSize: 13, lineHeight: 1.5 }}>
                      <div>
                        24h: <span style={{ color: "var(--text)" }}>{analytics.d1?.uniqueWallets ?? 0}</span> wallets ·{" "}
                        <span style={{ color: "var(--text)" }}>{analytics.d1?.attempts ?? 0}</span> attempts · Allow{" "}
                        <span style={{ color: "var(--text)" }}>{analytics.d1?.allowed ?? 0}</span> / Block{" "}
                        <span style={{ color: "var(--text)" }}>{analytics.d1?.blocked ?? 0}</span>
                      </div>
                      <div>
                        7d: <span style={{ color: "var(--text)" }}>{analytics.d7?.uniqueWallets ?? 0}</span> wallets ·{" "}
                        <span style={{ color: "var(--text)" }}>{analytics.d7?.attempts ?? 0}</span> attempts · Allow{" "}
                        <span style={{ color: "var(--text)" }}>{analytics.d7?.allowed ?? 0}</span> / Block{" "}
                        <span style={{ color: "var(--text)" }}>{analytics.d7?.blocked ?? 0}</span>
                      </div>
                      <div>
                        30d: <span style={{ color: "var(--text)" }}>{analytics.d30?.uniqueWallets ?? 0}</span> wallets ·{" "}
                        <span style={{ color: "var(--text)" }}>{analytics.d30?.attempts ?? 0}</span> attempts
                      </div>
                      <div style={{ marginTop: 6, fontSize: 12, opacity: 0.9 }}>
                        Hinweis: Zählt Wallet-Login-Versuche (aus /auth/verify) seit dem letzten Deploy; Daten liegen in Redis.
                      </div>
                    </div>
                  ) : (
                    <div style={{ marginTop: 8, opacity: 0.75, fontSize: 13 }}>Loading…</div>
                  )}
                </div>

                <div style={{ marginTop: 12, display: "flex", gap: 10, flexWrap: "wrap" }}>
                  <button className="btn" onClick={() => { loadStatus(); loadAnalytics(); }}>
                    Refresh
                  </button>
                </div>
              </div>
            </div>

            {/* Quick actions */}
            <div className="card" style={{ padding: 16, marginTop: 14 }}>
              <div style={{ fontWeight: 900, marginBottom: 10 }}>Quick actions</div>

              <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
                <Link className="btn" href="/admin/admins">
                  Admins
                </Link>
                <Link className="btn" href="/admin/csv">
                  CSV Import/Export
                </Link>
                <button
                  className="btn"
                  onClick={() => {
                    try {
                      localStorage.removeItem("admin_jwt");
                    } catch {}
                    window.location.href = "/admin/login";
                  }}
                >
                  Logout
                </button>
              </div>
            </div>
          </>
        )}
      </div>
    </AdminLayout>
  );
}