import { useEffect, useState } from "react";
import { apiFetch } from "../../lib/api";

export default function AdminProductsList() {
  const [items, setItems] = useState<any[]>([]);
  const [search, setSearch] = useState("");
  const [err, setErr] = useState("");

  const token = typeof window !== "undefined" ? localStorage.getItem("admin_jwt") || "" : "";

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
  }, []);

  return (
    <div style={{ maxWidth: 900, margin: "40px auto", padding: 16, fontFamily: "system-ui" }}>
      <h1>Products (Admin CRUD)</h1>
      {err && <p style={{ color: "crimson" }}>{err}</p>}

      <div style={{ display: "flex", gap: 10, marginTop: 12 }}>
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search..."
          style={{ flex: 1, padding: 10 }}
        />
        <button onClick={load} style={{ padding: "10px 14px" }}>
          Search
        </button>
        <button
          onClick={() => (window.location.href = "/admin/products-edit")}
          style={{ padding: "10px 14px" }}
        >
          Create
        </button>
      </div>

      <table style={{ width: "100%", marginTop: 16, borderCollapse: "collapse" }}>
        <thead>
          <tr>
            <th style={{ textAlign: "left", borderBottom: "1px solid #ddd", padding: 8 }}>Title</th>
            <th style={{ textAlign: "left", borderBottom: "1px solid #ddd", padding: 8 }}>Status</th>
            <th style={{ textAlign: "left", borderBottom: "1px solid #ddd", padding: 8 }}>Updated</th>
            <th style={{ borderBottom: "1px solid #ddd", padding: 8 }}></th>
          </tr>
        </thead>
        <tbody>
          {items.map((p) => (
            <tr key={p.id}>
              <td style={{ padding: 8, borderBottom: "1px solid #eee" }}>{p.title}</td>
              <td style={{ padding: 8, borderBottom: "1px solid #eee" }}>{p.status}</td>
              <td style={{ padding: 8, borderBottom: "1px solid #eee" }}>
                {new Date(p.updated_at).toLocaleString()}
              </td>
              <td style={{ padding: 8, borderBottom: "1px solid #eee" }}>
                <button
                  onClick={() => (window.location.href = `/admin/products-edit?id=${p.id}`)}
                  style={{ padding: "6px 10px" }}
                >
                  Edit
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>

      <p style={{ marginTop: 16, opacity: 0.7 }}>Tip: use the editor page to upload an image and edit fields/tags.</p>
    </div>
  );
}