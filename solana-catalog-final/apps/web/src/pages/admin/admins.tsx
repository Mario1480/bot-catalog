import { useEffect, useState } from "react";
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

type AdminRow = {
  id: string;
  email: string;
  created_at?: string;
  updated_at?: string;
};

export default function AdminsPage() {
  const token =
    typeof window !== "undefined" ? localStorage.getItem("admin_jwt") || "" : "";

  const [items, setItems] = useState<AdminRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState("");

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");

  async function load() {
    setErr("");
    setLoading(true);
    try {
      const out = await apiFetch("/admin/admins", { method: "GET" }, token);
      setItems(Array.isArray(out) ? out : []);
    } catch (e: any) {
      const msg = (e?.message || "Failed to load admins").toString();
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
  }

  useEffect(() => {
    if (!token) {
      window.location.href = "/admin/login";
      return;
    }
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function createAdmin() {
    setErr("");
    setSaving(true);
    try {
      const payload = { email, password };
      await apiFetch("/admin/admins", { method: "POST", body: JSON.stringify(payload) }, token);
      setEmail("");
      setPassword("");
      await load();
      alert("Admin created");
    } catch (e: any) {
      setErr(e?.message || "Create failed");
    } finally {
      setSaving(false);
    }
  }

  async function delAdmin(id: string, email: string) {
    if (!confirm(`Delete admin ${email}?`)) return;
    setErr("");
    try {
      await apiFetch(`/admin/admins/${id}`, { method: "DELETE" }, token);
      await load();
    } catch (e: any) {
      setErr(e?.message || "Delete failed");
    }
  }

  return (
    <AdminLayout title="Admins">
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

        <div className="card" style={{ padding: 16, marginBottom: 14 }}>
          <div style={{ fontWeight: 900, marginBottom: 10 }}>Create new admin</div>

          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr auto", gap: 10 }}>
            <input
              className="input"
              placeholder="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />
            <input
              className="input"
              placeholder="password (min 8 chars)"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
            <button className="btn btnPrimary" disabled={saving} onClick={createAdmin}>
              {saving ? "Creating…" : "Create"}
            </button>
          </div>

          <div style={{ color: "var(--muted)", fontSize: 12, marginTop: 10 }}>
            Tipp: Passwort wird gehashed gespeichert. Am besten später eine “Reset password” Funktion.
          </div>
        </div>

        <div className="card" style={{ padding: 16 }}>
          <div style={{ display: "flex", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
            <div>
              <div style={{ fontWeight: 900 }}>Admin accounts</div>
              <div style={{ color: "var(--muted)", fontSize: 13, marginTop: 6 }}>
                {loading ? "Loading…" : `${items.length} admin(s)`}
              </div>
            </div>

            <button className="btn" onClick={load} disabled={loading}>
              Refresh
            </button>
          </div>

          <div style={{ height: 12 }} />

          <div style={{ overflowX: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse", minWidth: 700 }}>
              <thead>
                <tr>
                  <th style={{ textAlign: "left", padding: 10, borderBottom: "1px solid var(--border)" }}>
                    Email
                  </th>
                  <th style={{ textAlign: "left", padding: 10, borderBottom: "1px solid var(--border)" }}>
                    Created
                  </th>
                  <th style={{ textAlign: "left", padding: 10, borderBottom: "1px solid var(--border)" }}>
                    Updated
                  </th>
                  <th style={{ padding: 10, borderBottom: "1px solid var(--border)" }} />
                </tr>
              </thead>

              <tbody>
                {items.map((a) => (
                  <tr key={a.id}>
                    <td style={{ padding: 10, borderBottom: "1px solid var(--border)" }}>{a.email}</td>
                    <td style={{ padding: 10, borderBottom: "1px solid var(--border)", color: "var(--muted)" }}>
                      {a.created_at ? new Date(a.created_at).toLocaleString() : "-"}
                    </td>
                    <td style={{ padding: 10, borderBottom: "1px solid var(--border)", color: "var(--muted)" }}>
                      {a.updated_at ? new Date(a.updated_at).toLocaleString() : "-"}
                    </td>
                    <td style={{ padding: 10, borderBottom: "1px solid var(--border)", textAlign: "right" }}>
                      <button className="btn" onClick={() => delAdmin(a.id, a.email)}>
                        Delete
                      </button>
                    </td>
                  </tr>
                ))}

                {!loading && items.length === 0 ? (
                  <tr>
                    <td colSpan={4} style={{ padding: 14, color: "var(--muted)" }}>
                      No admins found.
                    </td>
                  </tr>
                ) : null}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </AdminLayout>
  );
}