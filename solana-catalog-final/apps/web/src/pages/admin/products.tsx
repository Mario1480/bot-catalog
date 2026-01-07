import { useEffect, useState } from "react";
import { apiFetch } from "../../lib/api";
import { AdminLayout } from "../../components/admin/AdminLayout";

export default function AdminProductsList() {
  const [items, setItems] = useState<any[]>([]);
  const [search, setSearch] = useState("");
  const [err, setErr] = useState("");

  const token =
    typeof window !== "undefined" ? localStorage.getItem("admin_jwt") || "" : "";

  async function load() {
    setErr("");
    try {
      const qs = search ? `?search=${encodeURIComponent(search)}` : "";
      const out = await apiFetch(`/admin/products${qs}`, { method: "GET" }, token);
      setItems(out);
    } catch (e: any) {
      setErr(e.message || "Failed");
    }
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <AdminLayout title="Products">
      <div style={{ maxWidth: 1100 }}>
        {err && <p style={{ color: "crimson" }}>{err}</p>}

        <div className="card" style={{ padding: 14 }}>
          <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
            <input
              className="input"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search..."
              style={{ flex: 1, minWidth: 220 }}
            />
            <button className="btn" onClick={load}>
              Search
            </button>
            <button
              className="btn btnPrimary"
              onClick={() => (window.location.href = "/admin/products-edit")}
            >
              Create
            </button>
          </div>
        </div>

        <div className="card" style={{ padding: 0, marginTop: 14, overflow: "hidden" }}>
          <table style={{ width: "100%", borderCollapse: "collapse" }}>
            <thead>
              <tr>
                <th style={{ textAlign: "left", borderBottom: "1px solid var(--border)", padding: 12 }}>
                  Title
                </th>
                <th style={{ textAlign: "left", borderBottom: "1px solid var(--border)", padding: 12 }}>
                  Status
                </th>
                <th style={{ textAlign: "left", borderBottom: "1px solid var(--border)", padding: 12 }}>
                  Updated
                </th>
                <th style={{ borderBottom: "1px solid var(--border)", padding: 12 }} />
              </tr>
            </thead>
            <tbody>
              {items.map((p) => (
                <tr key={p.id}>
                  <td style={{ padding: 12, borderBottom: "1px solid var(--border)" }}>
                    {p.title}
                  </td>
                  <td style={{ padding: 12, borderBottom: "1px solid var(--border)" }}>
                    {p.status}
                  </td>
                  <td style={{ padding: 12, borderBottom: "1px solid var(--border)" }}>
                    {p.updated_at ? new Date(p.updated_at).toLocaleString() : "-"}
                  </td>
                  <td style={{ padding: 12, borderBottom: "1px solid var(--border)", textAlign: "right" }}>
                    <button
                      className="btn"
                      onClick={() => (window.location.href = `/admin/products-edit?id=${p.id}`)}
                    >
                      Edit
                    </button>
                  </td>
                </tr>
              ))}

              {items.length === 0 && (
                <tr>
                  <td colSpan={4} style={{ padding: 14, opacity: 0.75 }}>
                    No products found.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        <div style={{ marginTop: 12, opacity: 0.7, fontSize: 13 }}>
          Tip: use the editor page to upload an image and edit fields/tags.
        </div>
      </div>
    </AdminLayout>
  );
}