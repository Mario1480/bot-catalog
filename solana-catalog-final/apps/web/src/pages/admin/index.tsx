// apps/web/src/pages/admin/index.tsx
import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { AdminLayout } from "../../components/admin/AdminLayout";
import { apiFetch } from "../../lib/api";

type ProductsStats = {
  total: number;
  published: number;
  draft: number;
};

type StatusResp = {
  uptimeSec: number;
  dbOk: boolean;
  redisOk: boolean;
  now: string;
  node?: string;
};

type AnalyticsBucket = {
  attempts: number;
  allowed: number;
  blocked: number;
  uniqueWallets: number;
};

type UserAnalyticsResp = {
  d1: AnalyticsBucket;
  d7: AnalyticsBucket;
  d30: AnalyticsBucket;
};

type GatePreview = {
  enabled: boolean;
  mode: "amount" | "usd" | "none";
  mint_address: string;
  min_amount: number | null;
  min_usd: number | null;
  tolerance_percent: number;
  priceUsd: number | null;
  requiredUsd: number | null;
  requiredTokens: number | null;
};

function fmtInt(n: any) {
  const v = Number(n);
  if (!Number.isFinite(v)) return "-";
  return new Intl.NumberFormat().format(v);
}

function fmtUsd(n: any) {
  const v = Number(n);
  if (!Number.isFinite(v)) return "-";
  return new Intl.NumberFormat(undefined, { style: "currency", currency: "USD" }).format(v);
}

function fmtNum(n: any, digits = 4) {
  const v = Number(n);
  if (!Number.isFinite(v)) return "-";
  return new Intl.NumberFormat(undefined, { maximumFractionDigits: digits }).format(v);
}

function Badge({ ok, label }: { ok: boolean; label: string }) {
  return (
    <span
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: 8,
        padding: "6px 10px",
        borderRadius: 999,
        border: "1px solid var(--border)",
        background: ok ? "rgba(60, 255, 160, .08)" : "rgba(255, 80, 80, .08)",
      }}
    >
      <span
        style={{
          width: 8,
          height: 8,
          borderRadius: 999,
          background: ok ? "rgba(60, 255, 160, .9)" : "rgba(255, 80, 80, .9)",
          display: "inline-block",
        }}
      />
      <span style={{ fontSize: 13, color: "var(--text)" }}>{label}</span>
    </span>
  );
}

function StatRow({ label, value }: { label: string; value: any }) {
  return (
    <div style={{ display: "flex", justifyContent: "space-between", gap: 12, padding: "8px 0" }}>
      <div style={{ color: "var(--muted)", fontSize: 13 }}>{label}</div>
      <div style={{ fontWeight: 800 }}>{value}</div>
    </div>
  );
}

export default function AdminDashboardPage() {
  const token = typeof window !== "undefined" ? localStorage.getItem("admin_jwt") || "" : "";

  const [stats, setStats] = useState<ProductsStats | null>(null);
  const [status, setStatus] = useState<StatusResp | null>(null);
  const [ua, setUa] = useState<UserAnalyticsResp | null>(null);
  const [gate, setGate] = useState<GatePreview | null>(null);

  const [err, setErr] = useState<string>("");
  const [loading, setLoading] = useState(true);

  async function loadAll() {
    setErr("");
    setLoading(true);
    try {
      const [s1, s2, s3, s4] = await Promise.all([
        apiFetch("/admin/products/stats", { method: "GET" }, token),
        apiFetch("/admin/status", { method: "GET" }, token),
        apiFetch("/admin/user-analytics", { method: "GET" }, token),
        apiFetch("/admin/gate-preview", { method: "GET" }, token),
      ]);

      setStats({
        total: Number(s1?.total ?? 0),
        published: Number(s1?.published ?? 0),
        draft: Number(s1?.draft ?? 0),
      });
      setStatus(s2 as StatusResp);
      setUa(s3 as UserAnalyticsResp);
      setGate(s4 as GatePreview);
    } catch (e: any) {
      setErr(e?.message || "Failed to load dashboard");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadAll();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const gateSummary = useMemo(() => {
    if (!gate) return null;

    const enabled = gate.enabled;
    const modeLabel = gate.mode === "usd" ? "Min USD" : gate.mode === "amount" ? "Min Tokens" : "Not set";

    const price = gate.priceUsd != null ? fmtUsd(gate.priceUsd) : "-";

    let req = "-";
    if (gate.mode === "usd") {
      req = gate.min_usd != null ? fmtUsd(gate.min_usd) : "-";
    }
    if (gate.mode === "amount") {
      req = gate.min_amount != null ? fmtNum(gate.min_amount, 6) : "-";
    }

    let requiredTokens = "-";
    if (gate.requiredTokens != null) requiredTokens = fmtNum(gate.requiredTokens, 6);

    let requiredUsd = "-";
    if (gate.requiredUsd != null) requiredUsd = fmtUsd(gate.requiredUsd);

    return { enabled, modeLabel, price, req, requiredTokens, requiredUsd };
  }, [gate]);

  return (
    <AdminLayout title="Admin Dashboard">
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

      <div style={{ display: "grid", gap: 14 }}>
        {/* Quick Actions */}
        <div className="card" style={{ padding: 16 }}>
          <div style={{ display: "flex", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
            <div>
              <div style={{ fontWeight: 900, fontSize: 18 }}>Quick actions</div>
              <div style={{ color: "var(--muted)", marginTop: 6, fontSize: 13 }}>
                Manage token gating, categories, products, CSV and admins.
              </div>
            </div>

            <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
              <Link className="btn" href="/admin/gate">
                Open Token Gating
              </Link>
              <Link className="btn" href="/admin/categories">
                Categories
              </Link>
              <Link className="btn" href="/admin/products">
                Products
              </Link>
              <Link className="btn" href="/admin/csv">
                CSV Import/Export
              </Link>
              <Link className="btn" href="/admin/admins">
                Admins
              </Link>
              <button className="btn" onClick={loadAll} disabled={loading}>
                {loading ? "Refreshing…" : "Refresh"}
              </button>
            </div>
          </div>

          {gateSummary ? (
            <div style={{ marginTop: 14, display: "grid", gap: 10 }}>
              <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
                <Badge ok={!!gateSummary.enabled} label={gateSummary.enabled ? "Gating enabled" : "Gating disabled"} />
              </div>
              <div
                style={{
                  display: "grid",
                  gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
                  gap: 12,
                }}
              >
                <div className="card" style={{ padding: 12 }}>
                  <div style={{ fontWeight: 900, marginBottom: 6 }}>Gate config</div>
                  <div style={{ color: "var(--muted)", fontSize: 13 }}>Mode: {gateSummary.modeLabel}</div>
                  <div style={{ color: "var(--muted)", fontSize: 13, marginTop: 4 }}>Requirement: {gateSummary.req}</div>
                </div>

                <div className="card" style={{ padding: 12 }}>
                  <div style={{ fontWeight: 900, marginBottom: 6 }}>Token price</div>
                  <div style={{ color: "var(--muted)", fontSize: 13 }}>Current: {gateSummary.price}</div>
                  <div style={{ color: "var(--muted)", fontSize: 13, marginTop: 4 }}>
                    Needed tokens: {gateSummary.requiredTokens}
                  </div>
                </div>

                <div className="card" style={{ padding: 12 }}>
                  <div style={{ fontWeight: 900, marginBottom: 6 }}>Value preview</div>
                  <div style={{ color: "var(--muted)", fontSize: 13 }}>≈ {gateSummary.requiredUsd}</div>
                  <div style={{ color: "var(--muted)", fontSize: 13, marginTop: 4 }}>
                    (incl. tolerance handled on verify)
                  </div>
                </div>
              </div>
            </div>
          ) : null}
        </div>

        {/* Stats + Health */}
        <div
          style={{
            display: "grid",
            gap: 14,
            gridTemplateColumns: "repeat(auto-fit, minmax(320px, 1fr))",
          }}
        >
          <div className="card" style={{ padding: 16 }}>
            <div style={{ fontWeight: 900, marginBottom: 10 }}>Products</div>
            {loading && !stats ? (
              <div style={{ color: "var(--muted)" }}>Loading…</div>
            ) : stats ? (
              <>
                <StatRow label="Total" value={fmtInt(stats.total)} />
                <StatRow label="Published" value={fmtInt(stats.published)} />
                <StatRow label="Draft" value={fmtInt(stats.draft)} />
              </>
            ) : (
              <div style={{ color: "var(--muted)" }}>No data.</div>
            )}
          </div>

          <div className="card" style={{ padding: 16 }}>
            <div style={{ fontWeight: 900, marginBottom: 10 }}>Health / Status</div>
            {loading && !status ? (
              <div style={{ color: "var(--muted)" }}>Loading…</div>
            ) : status ? (
              <>
                <div style={{ display: "flex", gap: 10, flexWrap: "wrap", marginBottom: 10 }}>
                  <Badge ok={!!status.dbOk} label={status.dbOk ? "DB OK" : "DB ERROR"} />
                  <Badge ok={!!status.redisOk} label={status.redisOk ? "Redis OK" : "Redis ERROR"} />
                </div>
                <StatRow label="Uptime" value={`${fmtInt(status.uptimeSec)}s`} />
                <StatRow label="Server time" value={status.now ? new Date(status.now).toLocaleString() : "-"} />
                <StatRow label="Node" value={status.node || "-"} />
              </>
            ) : (
              <div style={{ color: "var(--muted)" }}>No data.</div>
            )}
          </div>
        </div>

        {/* User analytics */}
        <div className="card" style={{ padding: 16 }}>
          <div style={{ fontWeight: 900, marginBottom: 10 }}>User analytics</div>

          {loading && !ua ? (
            <div style={{ color: "var(--muted)" }}>Loading…</div>
          ) : ua ? (
            <div
              style={{
                display: "grid",
                gap: 12,
                gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))",
              }}
            >
              {(
                [
                  ["Last 24h", ua.d1],
                  ["Last 7d", ua.d7],
                  ["Last 30d", ua.d30],
                ] as Array<[string, AnalyticsBucket]>
              ).map(([label, b]) => (
                <div key={label} className="card" style={{ padding: 12 }}>
                  <div style={{ fontWeight: 900, marginBottom: 8 }}>{label}</div>
                  <div style={{ display: "grid", gap: 6 }}>
                    <StatRow label="Attempts" value={fmtInt(b.attempts)} />
                    <StatRow label="Allowed" value={fmtInt(b.allowed)} />
                    <StatRow label="Blocked" value={fmtInt(b.blocked)} />
                    <StatRow label="Unique wallets" value={fmtInt(b.uniqueWallets)} />
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div style={{ color: "var(--muted)" }}>No data.</div>
          )}

          <div style={{ marginTop: 10, color: "var(--muted)", fontSize: 12 }}>
            Tip: These counters are updated during wallet verify (attempts/allowed/blocked + unique wallets via Redis HLL).
          </div>
        </div>
      </div>
    </AdminLayout>
  );
}