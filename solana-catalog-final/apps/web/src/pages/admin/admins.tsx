import { useEffect, useMemo, useState } from "react";
import { AdminLayout } from "../../components/admin/AdminLayout";
import { apiFetch } from "../../lib/api";

type AdminRow = {
  id: string;
  email: string;
  created_at: string;
  updated_at: string;
};

export default function AdminsPage() {
  const token =
    typeof window !== "undefined" ? localStorage.getItem("admin_jwt") || "" : "";

  const [items, setItems] = useState<AdminRow[]>([]);
  const [err, setErr] = useState("");
  const [loading, setLoading] = useState(true);

  // create
  const [newEmail, setNewEmail] = useState("");
  const [newPw, setNewPw] = useState("");
  const [creating, setCreating] = useState(false);

  // reset password
  const [resetId, setResetId] = useState<string | null>(null);
  const [resetEmail, setResetEmail] = useState("");
  const [resetPw, setResetPw] = useState("");
  const [resetting, setResetting] = useState(false);

  const canCreate = useMemo(() => {
    return newEmail.trim().length > 3 && newPw.length >= 8;
  }, [newEmail, newPw]);

  async function load() {
    setErr("");
    setLoading(true);
    try {
      const out = await apiFetch("/admin/admins", { method: "GET" }, token);
      setItems(Array.isArray(out) ? out : []);
    } catch (e: any) {
      setErr(e?.message || "Failed to load admins");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function createAdmin() {
    setErr("");
    setCreating(true);
    try {
      const out = await apiFetch(
        "/admin/admins",
        {
          method: "POST",
          body: JSON.stringify({
            email: newEmail.trim().toLowerCase(),
            password: newPw,
          }),
        },
        token
      );

      setNewEmail("");
      setNewPw("");
      await load();
      alert(`Admin created: ${out?.email || "ok"}`);
    } catch (e: any) {
      setErr(e?.message || "Create failed");
    } finally {
      setCreating(false);
    }
  }

  function openReset(a: AdminRow) {
    setResetId(a.id);
    setResetEmail(a.email);
    setResetPw("");
    setErr("");
  }

  async function doReset() {
    if (!resetId) return;
    setErr("");
    setResetting(true);
    try {
      await apiFetch(
        `/admin/admins/${resetId}`,
        {
          method: "PUT",
          body: JSON.stringify({ password: resetPw }),
        },
        token
      );
      setResetId(null);
      setResetEmail("");
      setResetPw("");
      alert("Password updated");
      await load();
    } catch (e: any) {
      setErr(e?.message || "Reset failed");
    } finally {
      setResetting(false);
    }
  }

  async function del(id: string, email: string) {
    if (!confirm(`Delete admin "${email}"?`)) return;
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
        <div style={{ fontWeight: 900, marginBottom: 10 }}>Create new admin</div>

        <div style={{ display: "grid", gap: 10, maxWidth: 520 }}>
          <input
            className="input"
            placeholder="Email"
            value={newEmail}
            onChange={(e) => setNewEmail(e.target.value)}
          />

          <input
            className="input"
            placeholder="Password (min 8 chars)"
            type="password"
            value={newPw}
            onChange={(e) => setNewPw(e.target.value)}
          />

          <button
            className="btn btnPrimary"
            disabled={!canCreate || creating}
            onClick={createAdmin}
            style={{ width: "fit-content" }}
          >
            {creating ? "Creating…" : "Create admin"}
          </button>

          <div style={{ fontSize: 12, color: "var(--muted)" }}>
            Tipp: Passwort am besten direkt danach im Passwortmanager speichern.
          </div>
        </div>
      </div>

      <div className="card" style={{ padding: 16 }}>
        <div style={{ fontWeight: 900, marginBottom: 10 }}>Admins</div>

        {loading ? (
          <div style={{ color: "var(--muted)" }}>Loading…</div>
        ) : items.length === 0 ? (
          <div style={{ color: "var(--muted)" }}>No admins found.</div>
        ) : (
          <div className="adminTableWrap">
            <table style={{ width: "100%", borderCollapse: "collapse" }}>
              <thead>
                <tr>
                  <th style={{ textAlign: "left", borderBottom: "1px solid var(--border)", padding: 10 }}>
                    Email
                  </th>
                  <th style={{ textAlign: "left", borderBottom: "1px solid var(--border)", padding: 10 }}>
                    Created
                  </th>
                  <th style={{ textAlign: "left", borderBottom: "1px solid var(--border)", padding: 10 }}>
                    Updated
                  </th>
                  <th style={{ borderBottom: "1px solid var(--border)", padding: 10 }} />
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
                    <td style={{ padding: 10, borderBottom: "1px solid var(--border)" }}>
                      <div style={{ display: "flex", gap: 10, justifyContent: "flex-end", flexWrap: "wrap" }}>
                        <button className="btn" onClick={() => openReset(a)}>
                          Reset password
                        </button>
                        <button
                          className="btn"
                          onClick={() => del(a.id, a.email)}
                          style={{
                            borderColor: "rgba(255,80,80,.35)",
                            background: "rgba(255,80,80,.08)",
                          }}
                        >
                          Delete
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Reset password modal */}
      {resetId ? (
        <div
          onClick={() => setResetId(null)}
          style={{
            position: "fixed",
            inset: 0,
            background: "rgba(0,0,0,.65)",
            zIndex: 80,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            padding: 16,
          }}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className="card"
            style={{ width: "min(720px, 100%)", padding: 16 }}
          >
            <div style={{ display: "flex", justifyContent: "space-between", gap: 12, alignItems: "center" }}>
              <div style={{ fontWeight: 900 }}>Reset password</div>
              <button className="btn" onClick={() => setResetId(null)}>
                ✕
              </button>
            </div>

            <div style={{ marginTop: 10, color: "var(--muted)", fontSize: 13 }}>
              Admin: <span style={{ color: "var(--text)" }}>{resetEmail}</span>
            </div>

            <div style={{ marginTop: 12, display: "grid", gap: 10 }}>
              <input
                className="input"
                type="password"
                placeholder="New password (min 8 chars)"
                value={resetPw}
                onChange={(e) => setResetPw(e.target.value)}
              />

              <div style={{ display: "flex", gap: 10, justifyContent: "flex-end", flexWrap: "wrap" }}>
                <button className="btn" onClick={() => setResetId(null)}>
                  Cancel
                </button>
                <button
                  className="btn btnPrimary"
                  disabled={resetPw.length < 8 || resetting}
                  onClick={doReset}
                >
                  {resetting ? "Saving…" : "Save"}
                </button>
              </div>
            </div>
          </div>
        </div>
      ) : null}
    </AdminLayout>
  );
}
