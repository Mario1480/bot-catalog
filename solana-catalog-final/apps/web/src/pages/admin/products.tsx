import { useEffect, useState } from "react";
import Link from "next/link";
import { apiFetch } from "../../lib/api";
import { AdminLayout } from "../../components/admin/AdminLayout";

export default function AdminProductsList() {
  const [items, setItems] = useState<any[]>([]);
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState("");

  const token =
    typeof window !== "undefined" ? localStorage.getItem("admin_jwt") || "" : "";

  async function load() {
    setErr("");
    setLoading(true);
    try {
      const qs = search ? `?search=${encodeURIComponent(search)}` : "";
      const out = await apiFetch(`/admin/products${qs}`, { method: "GET" }, token);
      setItems(Array.isArray(out) ? out : []);
    } catch (e: any) {
      setErr(e?.message || "Failed to load products");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <AdminLayout title="Products">
      {/* Error */}
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

      {/* Header / Actions */}
      <div
        className="card"
        style={{
          padding: 16,
          marginBottom: 16,
          display: "flex",
          gap: 12,
          flexWrap: "wrap",
          alignItems: "center",
          justifyContent: "space-between",
        }}
      >
        <div style={{ fontWeight: 900, fontSize: 18 }}>Products</div>

        <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
          <input
            className="input"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search products…"
            style={{ minWidth: 220 }}
          />

          <button className="btn" onClick={load} disabled={loading}>
            {loading ? "Loading…" : "Search"}
          </button>

          <Link href="/admin/products-edit" className="btn btnPrimary">
            + Create product
          </Link>
        </div>
      </div>

      {/* Table */}
      <div className="card" style={{ padding: 0, overflowX: "auto" }}>
        <table
          style={{
            width: "100%",
            borderCollapse: "collapse",
            fontSize: 14,
          }}
        >
          <thead>
            <tr>
              <th style={th}>Title</th>
              <th style={th}>Status</th>
              <th style={th}>Updated</th>
              <th style={th}></th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr>
                <td colSpan={4} style={{ padding: 16, color: "var(--muted)" }}>
                  Loading…
                </td>
              </tr>
            ) : items.length === 0 ? (
              <tr>
                <td colSpan={4} style={{ padding: 16, color: "var(--muted)" }}>
                  No products found
                </td>
              </tr>
            ) : (
              items.map((p) => (
                <tr key={p.id}>
                  <td style={td}>{p.title || "Untitled"}</td>
                  <td style={td}>
                    <span
                      className="badge"
                      style={{
                        background:
                          p.status === "published"
                            ? "rgba(0,200,120,.15)"
                            : "rgba(255,193,7,.15)",
                        borderColor:
                          p.status === "published"
                            ? "rgba(0,200,120,.35)"
                            : "rgba(255,193,7,.35)",
                      }}
                    >
                      {p.status}
                    </span>
                  </td>
                  <td style={td}>
                    {p.updated_at
                      ? new Date(p.updated_at).toLocaleString()
                      : "-"}
                  </td>
                  <td style={{ ...td, textAlign: "right" }}>
                    <Link
                      href={`/admin/products-edit?id=${p.id}`}
                      className="btn"
                    >
                      Edit
                    </Link>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {/* Footer hint */}
      <div style={{ marginTop: 14, fontSize: 12, color: "var(--muted)" }}>
        Tip: Images, categories and custom fields are managed in the product
        editor.
      </div>
    </AdminLayout>
  );
}

/* simple table styles */
const th: React.CSSProperties = {
  textAlign: "left",
  padding: "10px 12px",
  borderBottom: "1px solid var(--border)",
  fontWeight: 800,
  fontSize: 13,
};

const td: React.CSSProperties = {
  padding: "10px 12px",
  borderBottom: "1px solid var(--border)",
  verticalAlign: "middle",
};