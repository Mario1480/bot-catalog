import { useEffect, useState } from "react";
import { apiFetch } from "../../lib/api";

export default function AdminProductsList() {
  const [items, setItems] = useState<any[]>([]);
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState<"all" | "published" | "draft">("all");
  const [err, setErr] = useState("");

  const token =
    typeof window !== "undefined" ? localStorage.getItem("admin_jwt") || "" : "";

  async function load() {
    setErr("");
    try {
      const qs = new URLSearchParams();
      if (search) qs.set("search", search);
      if (status !== "all") qs.set("status", status);

      const out = await apiFetch(
        `/admin/products${qs.toString() ? `?${qs.toString()}` : ""}`,
        { method: "GET" },
        token
      );

      setItems(Array.isArray(out) ? out : out?.items || []);
    } catch (e: any) {
      setErr(e.message || "Failed");
    }
  }

  useEffect(() => {
    load();
  }, []);

  return (
    <div style={{ maxWidth: 980, margin: "40px auto", padding: 16, fontFamily: "system-ui" }}>
      <div style={{ display: "flex", justifyContent: "space-between", gap: 12, alignItems: "center", flexWrap: "wrap" }}>
        <h1 style={{ margin: 0 }}>Products</h1>

        <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
          <button onClick={() => (window.location.href = "/admin")} style={{ padding: "10px 14px" }}>
            Back
          </button>
          <button onClick={() => (window.location.href = "/admin/products-edit")} style={{ padding: "10px 14px" }}>
            + Create
          </button>
        </div>
      </div>

      {err && <p style={{ color: "crimson" }}>{err}</p>}

      <div style={{ display: "flex", gap: 10, marginTop: 12, flexWrap: "wrap" }}>
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search title/description..."
          style={{ flex: 1, minWidth: 240, padding: 10 }}
        />

        <select
          value={status}
          onChange={(e) => setStatus(e.target.value as any)}
          style={{ padding: 10, minWidth: 160 }}
        >
          <option value="all">Status: All</option>
          <option value="published">Status: Published</option>
          <option value="draft">Status: Draft</option>
        </select>

        <button onClick={load} style={{ padding: "10px 14px" }}>
          Apply
        </button>
      </div>

      <table style={{ width: "100%", marginTop: 16, borderCollapse: "collapse" }}>
        <thead>
          <tr>
            <th style={{ textAlign: "left", borderBottom: "1px solid #ddd", padding: 8 }}>Title</th>
            <th style={{ textAlign: "left", borderBottom: "1px solid #ddd", padding: 8 }}>Status</th>
            <th style={{ textAlign: "left", borderBottom: "1px solid #ddd", padding: 8 }}>Updated</th>
            <th style={{ borderBottom: "1px solid #ddd", padding: 8 }} />
          </tr>
        </thead>
        <tbody>
          {items.map((p) => (
            <tr key={p.id}>
              <td style={{ padding: 8, borderBottom: "1px solid #eee" }}>{p.title}</td>
              <td style={{ padding: 8, borderBottom: "1px solid #eee" }}>{p.status}</td>
              <td style={{ padding: 8, borderBottom: "1px solid #eee" }}>
                {p.updated_at ? new Date(p.updated_at).toLocaleString() : "-"}
              </td>
              <td style={{ padding: 8, borderBottom: "1px solid #eee", textAlign: "right" }}>
                <button
                  onClick={() => (window.location.href = `/admin/products-edit?id=${p.id}`)}
                  style={{ padding: "8px 12px" }}
                >
                  Edit
                </button>
              </td>
            </tr>
          ))}

          {!items.length && (
            <tr>
              <td colSpan={4} style={{ padding: 12, opacity: 0.7 }}>
                No products found.
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );
}