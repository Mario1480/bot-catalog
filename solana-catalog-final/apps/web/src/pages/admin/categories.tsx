import { useEffect, useState } from "react";
import { apiFetch } from "../../lib/api";
import { AdminLayout } from "../../components/AdminLayout";

type Category = {
  id: string;
  name: string;
  sort_order: number;
  active: boolean;
  created_at: string;
  updated_at: string;
};

export default function AdminCategoriesPage() {
  const token =
    typeof window !== "undefined" ? localStorage.getItem("admin_jwt") || "" : "";

  const [items, setItems] = useState<Category[]>([]);
  const [err, setErr] = useState("");
  const [loading, setLoading] = useState(true);

  const [name, setName] = useState("");
  const [sortOrder, setSortOrder] = useState<number>(0);
  const [active, setActive] = useState(true);

  async function load(includeInactive = true) {
    setErr("");
    try {
      setLoading(true);
      const qs = includeInactive ? "?includeInactive=1" : "";
      const out = await apiFetch(`/admin/categories${qs}`, { method: "GET" }, token);
      setItems(Array.isArray(out) ? out : []);
    } catch (e: any) {
      setErr(e.message || "Failed");
    } finally {
      setLoading(false);
    }
  }

  async function create() {
    setErr("");
    try {
      const payload = { name, sort_order: sortOrder, active };
      const created = await apiFetch(
        "/admin/categories",
        { method: "POST", body: JSON.stringify(payload) },
        token
      );
      setName("");
      setSortOrder(0);
      setActive(true);
      setItems((prev) => [created, ...prev].sort((a, b) => (a.sort_order - b.sort_order) || a.name.localeCompare(b.name)));
    } catch (e: any) {
      setErr(e.message || "Create failed");
    }
  }

  async function toggleActive(cat: Category) {
    setErr("");
    try {
      const updated = await apiFetch(
        `/admin/categories/${cat.id}`,
        { method: "PUT", body: JSON.stringify({ active: !cat.active }) },
        token
      );
      setItems((prev) => prev.map((x) => (x.id === cat.id ? updated : x)));
    } catch (e: any) {
      setErr(e.message || "Update failed");
    }
  }

  async function updateSort(cat: Category, next: number) {
    setErr("");
    try {
      const updated = await apiFetch(
        `/admin/categories/${cat.id}`,
        { method: "PUT", body: JSON.stringify({ sort_order: next }) },
        token
      );
      setItems((prev) =>
        prev
          .map((x) => (x.id === cat.id ? updated : x))
          .sort((a, b) => (a.sort_order - b.sort_order) || a.name.localeCompare(b.name))
      );
    } catch (e: any) {
      setErr(e.message || "Update failed");
    }
  }

  async function remove(cat: Category) {
    if (!confirm(`Delete category "${cat.name}"?`)) return;
    setErr("");
    try {
      await apiFetch(`/admin/categories/${cat.id}`, { method: "DELETE" }, token);
      setItems((prev) => prev.filter((x) => x.id !== cat.id));
    } catch (e: any) {
      setErr(e.message || "Delete failed");
    }
  }

  useEffect(() => {
    load(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <AdminLayout title="Categories">
      <div style={{ maxWidth: 1100 }}>
        {err && <p style={{ color: "crimson" }}>{err}</p>}

        <div className="card" style={{ padding: 14 }}>
          <div style={{ fontWeight: 900, marginBottom: 10 }}>Create category</div>

          <div style={{ display: "grid", gridTemplateColumns: "1fr 160px 140px 140px", gap: 10, alignItems: "end" }}>
            <label style={{ display: "grid", gap: 6 }}>
              <div style={{ fontSize: 12, opacity: 0.8 }}>Name</div>
              <input className="input" value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Bots" />
            </label>

            <label style={{ display: "grid", gap: 6 }}>
              <div style={{ fontSize: 12, opacity: 0.8 }}>Sort order</div>
              <input
                className="input"
                type="number"
                value={sortOrder}
                onChange={(e) => setSortOrder(Number(e.target.value))}
              />
            </label>

            <label style={{ display: "grid", gap: 6 }}>
              <div style={{ fontSize: 12, opacity: 0.8 }}>Active</div>
              <select className="input" value={active ? "1" : "0"} onChange={(e) => setActive(e.target.value === "1")}>
                <option value="1">true</option>
                <option value="0">false</option>
              </select>
            </label>

            <button className="btn btnPrimary" onClick={create} disabled={!name.trim()}>
              Add
            </button>
          </div>

          <div style={{ marginTop: 12, display: "flex", gap: 10 }}>
            <button className="btn" onClick={() => load(true)} disabled={loading}>
              Refresh
            </button>
          </div>
        </div>

        <div className="card" style={{ padding: 0, marginTop: 14, overflow: "hidden" }}>
          <table style={{ width: "100%", borderCollapse: "collapse" }}>
            <thead>
              <tr>
                <th style={{ textAlign: "left", borderBottom: "1px solid var(--border)", padding: 12 }}>
                  Name
                </th>
                <th style={{ textAlign: "left", borderBottom: "1px solid var(--border)", padding: 12 }}>
                  Sort
                </th>
                <th style={{ textAlign: "left", borderBottom: "1px solid var(--border)", padding: 12 }}>
                  Active
                </th>
                <th style={{ borderBottom: "1px solid var(--border)", padding: 12 }} />
              </tr>
            </thead>
            <tbody>
              {items.map((c) => (
                <tr key={c.id} style={{ opacity: c.active ? 1 : 0.6 }}>
                  <td style={{ padding: 12, borderBottom: "1px solid var(--border)" }}>
                    {c.name}
                  </td>

                  <td style={{ padding: 12, borderBottom: "1px solid var(--border)" }}>
                    <input
                      className="input"
                      type="number"
                      value={c.sort_order ?? 0}
                      onChange={(e) => updateSort(c, Number(e.target.value))}
                      style={{ maxWidth: 120 }}
                    />
                  </td>

                  <td style={{ padding: 12, borderBottom: "1px solid var(--border)" }}>
                    <button className="btn" onClick={() => toggleActive(c)}>
                      {c.active ? "Active" : "Inactive"}
                    </button>
                  </td>

                  <td style={{ padding: 12, borderBottom: "1px solid var(--border)", textAlign: "right" }}>
                    <button className="btn" onClick={() => remove(c)}>
                      Delete
                    </button>
                  </td>
                </tr>
              ))}

              {items.length === 0 && (
                <tr>
                  <td colSpan={4} style={{ padding: 14, opacity: 0.75 }}>
                    No categories yet.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </AdminLayout>
  );
}