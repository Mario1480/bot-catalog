import { useEffect, useMemo, useState } from "react";
import { apiFetch } from "../../lib/api";

type Cat = {
  id: string;
  name: string;
  sort_order: number;
  active: boolean;
};

export default function AdminCategoriesPage() {
  const [items, setItems] = useState<Cat[]>([]);
  const [err, setErr] = useState("");
  const [saving, setSaving] = useState(false);

  const [name, setName] = useState("");
  const [sortOrder, setSortOrder] = useState("0");
  const [active, setActive] = useState(true);

  const token =
    typeof window !== "undefined" ? localStorage.getItem("admin_jwt") || "" : "";

  async function load() {
    setErr("");
    try {
      const out = await apiFetch("/admin/categories", { method: "GET" }, token);
      setItems(Array.isArray(out) ? out : out?.items || []);
    } catch (e: any) {
      setErr(e.message || "Failed");
    }
  }

  useEffect(() => {
    load();
  }, []);

  const sorted = useMemo(() => {
    return [...items].sort((a, b) => (a.sort_order - b.sort_order) || a.name.localeCompare(b.name));
  }, [items]);

  async function create() {
    setErr("");
    setSaving(true);
    try {
      const payload = {
        name: name.trim(),
        sort_order: Number(sortOrder || 0),
        active: !!active,
      };
      await apiFetch("/admin/categories", { method: "POST", body: JSON.stringify(payload) }, token);
      setName("");
      setSortOrder("0");
      setActive(true);
      await load();
    } catch (e: any) {
      setErr(e.message || "Create failed");
    } finally {
      setSaving(false);
    }
  }

  async function update(id: string, patch: Partial<Cat>) {
    setErr("");
    setSaving(true);
    try {
      await apiFetch(`/admin/categories/${id}`, { method: "PUT", body: JSON.stringify(patch) }, token);
      await load();
    } catch (e: any) {
      setErr(e.message || "Update failed");
    } finally {
      setSaving(false);
    }
  }

  async function del(id: string) {
    if (!confirm("Delete this category?")) return;
    setErr("");
    setSaving(true);
    try {
      await apiFetch(`/admin/categories/${id}`, { method: "DELETE" }, token);
      await load();
    } catch (e: any) {
      setErr(e.message || "Delete failed");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div style={{ maxWidth: 980, margin: "40px auto", padding: 16, fontFamily: "system-ui" }}>
      <div style={{ display: "flex", justifyContent: "space-between", gap: 12, alignItems: "center", flexWrap: "wrap" }}>
        <h1 style={{ margin: 0 }}>Categories</h1>
        <button onClick={() => (window.location.href = "/admin")} style={{ padding: "10px 14px" }}>
          Back
        </button>
      </div>

      {err && <p style={{ color: "crimson" }}>{err}</p>}

      <div style={{ border: "1px solid #ddd", borderRadius: 12, padding: 12, marginTop: 14 }}>
        <div style={{ fontWeight: 800, marginBottom: 10 }}>Add Category</div>

        <div style={{ display: "grid", gridTemplateColumns: "1fr 140px 140px auto", gap: 10, alignItems: "center" }}>
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Name (e.g. Bots)"
            style={{ padding: 10 }}
          />

          <input
            value={sortOrder}
            onChange={(e) => setSortOrder(e.target.value)}
            placeholder="Sort"
            style={{ padding: 10 }}
          />

          <label style={{ display: "flex", gap: 10, alignItems: "center" }}>
            <input type="checkbox" checked={active} onChange={(e) => setActive(e.target.checked)} />
            Active
          </label>

          <button disabled={saving} onClick={create} style={{ padding: "10px 14px" }}>
            {saving ? "Saving…" : "Add"}
          </button>
        </div>
      </div>

      <table style={{ width: "100%", marginTop: 16, borderCollapse: "collapse" }}>
        <thead>
          <tr>
            <th style={{ textAlign: "left", borderBottom: "1px solid #ddd", padding: 8 }}>Name</th>
            <th style={{ textAlign: "left", borderBottom: "1px solid #ddd", padding: 8 }}>Sort</th>
            <th style={{ textAlign: "left", borderBottom: "1px solid #ddd", padding: 8 }}>Active</th>
            <th style={{ borderBottom: "1px solid #ddd", padding: 8 }} />
          </tr>
        </thead>
        <tbody>
          {sorted.map((c) => (
            <tr key={c.id}>
              <td style={{ padding: 8, borderBottom: "1px solid #eee" }}>
                <input
                  value={c.name}
                  onChange={(e) => {
                    const v = e.target.value;
                    setItems((prev) => prev.map((x) => (x.id === c.id ? { ...x, name: v } : x)));
                  }}
                  onBlur={(e) => update(c.id, { name: e.target.value.trim() })}
                  style={{ padding: 8, width: "100%" }}
                />
              </td>

              <td style={{ padding: 8, borderBottom: "1px solid #eee", width: 120 }}>
                <input
                  value={String(c.sort_order)}
                  onChange={(e) => {
                    const v = Number(e.target.value || 0);
                    setItems((prev) => prev.map((x) => (x.id === c.id ? { ...x, sort_order: v } : x)));
                  }}
                  onBlur={(e) => update(c.id, { sort_order: Number(e.target.value || 0) })}
                  style={{ padding: 8, width: "100%" }}
                />
              </td>

              <td style={{ padding: 8, borderBottom: "1px solid #eee", width: 120 }}>
                <input
                  type="checkbox"
                  checked={!!c.active}
                  onChange={(e) => update(c.id, { active: e.target.checked })}
                />
              </td>

              <td style={{ padding: 8, borderBottom: "1px solid #eee", textAlign: "right", width: 120 }}>
                <button onClick={() => del(c.id)} disabled={saving} style={{ padding: "8px 12px" }}>
                  Delete
                </button>
              </td>
            </tr>
          ))}

          {!sorted.length && (
            <tr>
              <td colSpan={4} style={{ padding: 12, opacity: 0.7 }}>
                No categories yet.
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );
}