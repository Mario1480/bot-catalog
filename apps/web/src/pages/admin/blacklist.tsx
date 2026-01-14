import { useEffect, useMemo, useState } from "react";
import { AdminLayout } from "../../components/admin/AdminLayout";
import { apiFetch } from "../../lib/api";

type BlacklistRow = {
  id: string;
  pubkey: string;
  reason: string;
  created_at: string;
  updated_at: string;
};

export default function AdminBlacklistPage() {
  const token =
    typeof window !== "undefined" ? localStorage.getItem("admin_jwt") || "" : "";

  const [items, setItems] = useState<BlacklistRow[]>([]);
  const [search, setSearch] = useState("");
  const [err, setErr] = useState("");
  const [loading, setLoading] = useState(true);

  const [newPubkey, setNewPubkey] = useState("");
  const [newReason, setNewReason] = useState("");
  const [saving, setSaving] = useState(false);

  const canSave = useMemo(() => newPubkey.trim().length >= 20, [newPubkey]);

  async function load() {
    setErr("");
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (search.trim()) params.set("search", search.trim());
      const qs = params.toString() ? `?${params.toString()}` : "";
      const out = await apiFetch(`/admin/blacklist${qs}`, { method: "GET" }, token);
      setItems(Array.isArray(out) ? out : []);
    } catch (e: any) {
      setErr(e?.message || "Failed to load blacklist");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function add() {
    setErr("");
    setSaving(true);
    try {
      await apiFetch(
        "/admin/blacklist",
        {
          method: "POST",
          body: JSON.stringify({
            pubkey: newPubkey.trim(),
            reason: newReason.trim(),
          }),
        },
        token
      );
      setNewPubkey("");
      setNewReason("");
      await load();
    } catch (e: any) {
      setErr(e?.message || "Save failed");
    } finally {
      setSaving(false);
    }
  }

  async function remove(item: BlacklistRow) {
    if (!confirm(`Remove wallet from blacklist?\n${item.pubkey}`)) return;
    setErr("");
    try {
      await apiFetch(`/admin/blacklist/${item.id}`, { method: "DELETE" }, token);
      await load();
    } catch (e: any) {
      setErr(e?.message || "Delete failed");
    }
  }

  return (
    <AdminLayout title="Wallet Blacklist">
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

      <div className="card" style={{ padding: 16, marginBottom: 16 }}>
        <div style={{ fontWeight: 900, marginBottom: 10 }}>Add wallet to blacklist</div>

        <div style={{ display: "grid", gap: 10, maxWidth: 720 }}>
          <input
            className="input"
            placeholder="Wallet address (pubkey)"
            value={newPubkey}
            onChange={(e) => setNewPubkey(e.target.value)}
          />

          <input
            className="input"
            placeholder="Reason (optional)"
            value={newReason}
            onChange={(e) => setNewReason(e.target.value)}
          />

          <button
            className="btn btnPrimary"
            disabled={!canSave || saving}
            onClick={add}
            style={{ width: "fit-content" }}
          >
            {saving ? "Saving…" : "Blacklist wallet"}
          </button>

          <div style={{ fontSize: 12, color: "var(--muted)" }}>
            Tipp: Falls die Adresse bereits existiert, wird der Grund aktualisiert.
          </div>
        </div>
      </div>

      <div className="card" style={{ padding: 14 }}>
        <div style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "center" }}>
          <input
            className="input"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search by wallet or reason..."
            style={{ flex: 1, minWidth: 220 }}
          />
          <button className="btn" onClick={load} disabled={loading}>
            {loading ? "Loading…" : "Search"}
          </button>
        </div>
      </div>

      <div className="card adminTableWrap" style={{ padding: 0, marginTop: 14 }}>
        <table style={{ width: "100%", borderCollapse: "collapse" }}>
          <thead>
            <tr>
              <th style={{ textAlign: "left", borderBottom: "1px solid var(--border)", padding: 12 }}>
                Wallet
              </th>
              <th style={{ textAlign: "left", borderBottom: "1px solid var(--border)", padding: 12 }}>
                Reason
              </th>
              <th style={{ textAlign: "left", borderBottom: "1px solid var(--border)", padding: 12 }}>
                Created
              </th>
              <th style={{ borderBottom: "1px solid var(--border)", padding: 12 }} />
            </tr>
          </thead>
          <tbody>
            {items.map((item) => (
              <tr key={item.id}>
                <td style={{ padding: 12, borderBottom: "1px solid var(--border)" }}>{item.pubkey}</td>
                <td style={{ padding: 12, borderBottom: "1px solid var(--border)" }}>
                  {item.reason || "-"}
                </td>
                <td style={{ padding: 12, borderBottom: "1px solid var(--border)" }}>
                  {item.created_at ? new Date(item.created_at).toLocaleString() : "-"}
                </td>
                <td style={{ padding: 12, borderBottom: "1px solid var(--border)", textAlign: "right" }}>
                  <button
                    className="btn"
                    onClick={() => remove(item)}
                    style={{
                      borderColor: "rgba(255,80,80,.35)",
                      background: "rgba(255,80,80,.08)",
                    }}
                  >
                    Remove
                  </button>
                </td>
              </tr>
            ))}

            {items.length === 0 && !loading && (
              <tr>
                <td colSpan={4} style={{ padding: 14, opacity: 0.75 }}>
                  No blacklisted wallets found.
                </td>
              </tr>
            )}

            {loading && (
              <tr>
                <td colSpan={4} style={{ padding: 14, opacity: 0.75 }}>
                  Loading…
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      <div className="adminCards" style={{ marginTop: 14 }}>
        {items.map((item) => (
          <div key={item.id} className="card adminCard">
            <div style={{ fontWeight: 900, wordBreak: "break-all" }}>{item.pubkey}</div>
            <div className="adminMeta" style={{ marginTop: 6 }}>
              {item.reason || "-"}
            </div>
            <div className="adminMeta" style={{ marginTop: 6 }}>
              {item.created_at ? new Date(item.created_at).toLocaleString() : "-"}
            </div>
            <div className="adminCardActions" style={{ marginTop: 10 }}>
              <button
                className="btn"
                onClick={() => remove(item)}
                style={{
                  borderColor: "rgba(255,80,80,.35)",
                  background: "rgba(255,80,80,.08)",
                }}
              >
                Remove
              </button>
            </div>
          </div>
        ))}

        {items.length === 0 && !loading && (
          <div className="card adminCard" style={{ opacity: 0.75 }}>
            No blacklisted wallets found.
          </div>
        )}
        {loading && (
          <div className="card adminCard" style={{ opacity: 0.75 }}>
            Loading…
          </div>
        )}
      </div>
    </AdminLayout>
  );
}
