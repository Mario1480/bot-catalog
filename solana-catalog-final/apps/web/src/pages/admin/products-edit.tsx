import { useEffect, useMemo, useState } from "react";
import { apiFetch, apiBase } from "../../lib/api";
import { AdminLayout } from "../../components/admin/AdminLayout";

type KV = { key: string; value: string };

type Category = {
  id: string;
  name: string;
  sort_order: number;
  active: boolean;
  created_at: string;
  updated_at: string;
};

function qp(name: string): string {
  if (typeof window === "undefined") return "";
  const u = new URL(window.location.href);
  return u.searchParams.get(name) || "";
}

export default function ProductEditor() {
  const [err, setErr] = useState("");
  const [saving, setSaving] = useState(false);
  const [loading, setLoading] = useState(true);

  const [id, setId] = useState("");
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [imageUrl, setImageUrl] = useState("");
  const [targetUrl, setTargetUrl] = useState("");
  const [status, setStatus] = useState("published");

  const [tags, setTags] = useState<string[]>([]);
  const [fields, setFields] = useState<KV[]>([]);
  const [categories, setCategories] = useState<string[]>([]);

  // ✅ categories from backend
  const [categoryOptions, setCategoryOptions] = useState<Category[]>([]);
  const [categoriesLoading, setCategoriesLoading] = useState(true);

  const token =
    typeof window !== "undefined" ? localStorage.getItem("admin_jwt") || "" : "";

  const API = apiBase();

  /* ------------------ LOAD ID ------------------ */
  useEffect(() => {
    const existingId = qp("id");
    if (existingId) setId(existingId);
  }, []);

  /* ------------------ LOAD CATEGORIES ------------------ */
  async function loadCategories() {
    setCategoriesLoading(true);
    setErr("");
    try {
      // includeInactive damit du im Admin auch inaktive siehst (aber wir können sie disabled rendern)
      const out = await apiFetch(
        "/admin/categories?includeInactive=1",
        { method: "GET" },
        token
      );

      const rows: Category[] = Array.isArray(out) ? out : [];
      rows.sort((a, b) => {
        const so = (a.sort_order ?? 0) - (b.sort_order ?? 0);
        if (so !== 0) return so;
        return String(a.name || "").localeCompare(String(b.name || ""));
      });

      setCategoryOptions(rows);
    } catch (e: any) {
      // categories sind nice-to-have -> UI soll trotzdem benutzbar bleiben
      setErr(e?.message || "Failed to load categories");
      setCategoryOptions([]);
    } finally {
      setCategoriesLoading(false);
    }
  }

  useEffect(() => {
    if (!token) return;
    loadCategories();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token]);

  /* ------------------ LOAD PRODUCT ------------------ */
  useEffect(() => {
    (async () => {
      setLoading(true);
      setErr("");

      try {
        if (!id) return;

        const out = await apiFetch(`/admin/products/${id}`, { method: "GET" }, token);

        setTitle(out.title || "");
        setDescription(out.description || "");
        setImageUrl(out.image_url || "");
        setTargetUrl(out.target_url || "");
        setStatus(out.status || "published");
        setTags(Array.isArray(out.tags) ? out.tags : []);

        const rawFields = Array.isArray(out.fields) ? out.fields : [];
        const all: KV[] = rawFields.map((f: any) => ({
          key: String(f.key || ""),
          value: String(f.value || ""),
        }));

        // ✅ Categories aus fields ziehen (mehrere Zeilen)
        const cats = all
          .filter((f) => f.key === "category")
          .map((f) => String(f.value || "").trim())
          .filter(Boolean);

        setCategories(Array.from(new Set(cats)));

        // ✅ category NICHT doppelt in freien fields
        setFields(all.filter((f) => f.key !== "category"));
      } catch (e: any) {
        setErr(e?.message || "Load failed");
      } finally {
        setLoading(false);
      }
    })();
  }, [id, token]);

  /* ------------------ IMAGE PREVIEW ------------------ */
  const imgPreview = useMemo(() => {
    if (!imageUrl) return "";
    if (imageUrl.startsWith("http")) return imageUrl;
    if (imageUrl.startsWith("/uploads/")) return `${API}${imageUrl}`;
    return `${API}/uploads/${imageUrl}`;
  }, [imageUrl, API]);

  async function uploadImage(file: File) {
    setErr("");
    const form = new FormData();
    form.append("file", file);

    const res = await fetch(`${API}/admin/uploads/image`, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}` },
      body: form,
    });

    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data?.error || "Upload failed");

    setImageUrl(data.publicUrl);
  }

  /* ------------------ SAVE ------------------ */
  async function save() {
    setSaving(true);
    setErr("");

    try {
      const cleanedFields = fields
        .map((f) => ({ key: (f.key || "").trim(), value: (f.value || "").trim() }))
        .filter((f) => f.key && f.value && f.key !== "category"); // prevent category duplication

      const cleanedCategories = Array.from(
        new Set(categories.map((c) => (c || "").trim()).filter(Boolean))
      );

      const payload = {
        title,
        description,
        image_url: imageUrl,
        target_url: targetUrl,
        status,
        tags,
        fields: [
          ...cleanedFields,
          ...cleanedCategories.map((c) => ({ key: "category", value: c })),
        ],
      };

      if (!id) {
        const out = await apiFetch(
          "/admin/products",
          { method: "POST", body: JSON.stringify(payload) },
          token
        );
        window.location.href = `/admin/products-edit?id=${out.id}`;
      } else {
        await apiFetch(
          `/admin/products/${id}`,
          { method: "PUT", body: JSON.stringify(payload) },
          token
        );
        alert("Saved");
      }
    } catch (e: any) {
      setErr(e?.message || "Save failed");
    } finally {
      setSaving(false);
    }
  }

  function setField(i: number, key: string, value: string) {
    setFields((prev) => {
      const next = [...prev];
      next[i] = { key, value };
      return next;
    });
  }

  const availableActiveNames = useMemo(() => {
    return new Set(categoryOptions.filter((c) => c.active).map((c) => c.name));
  }, [categoryOptions]);

  const selectedButMissing = useMemo(() => {
    // Falls Kategorien gelöscht/umbenannt wurden: trotzdem anzeigen, damit nichts verloren geht
    const known = new Set(categoryOptions.map((c) => c.name));
    return categories.filter((c) => !known.has(c));
  }, [categories, categoryOptions]);

  return (
    <AdminLayout title={id ? "Edit Product" : "Create Product"} right={<></>}>
      <div className="card" style={{ padding: 16 }}>
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            gap: 12,
            alignItems: "center",
            flexWrap: "wrap",
          }}
        >
          <div>
            <div style={{ fontSize: 18, fontWeight: 900 }}>
              {id ? "Edit Product" : "Create Product"}
            </div>
            <div style={{ color: "var(--muted)", fontSize: 13, marginTop: 4 }}>
              {loading ? "Loading…" : " "}
            </div>
          </div>

          <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
            <button
              className="btn"
              onClick={() => (window.location.href = "/admin/products")}
            >
              Back
            </button>
            <button className="btn btnPrimary" disabled={saving} onClick={save}>
              {saving ? "Saving…" : "Save"}
            </button>
          </div>
        </div>

        {err ? (
          <div
            className="card"
            style={{
              marginTop: 12,
              padding: 12,
              borderColor: "rgba(255,80,80,.35)",
              background: "rgba(255,80,80,.08)",
            }}
          >
            <div style={{ fontWeight: 900 }}>Error</div>
            <div style={{ color: "var(--muted)", marginTop: 6 }}>{err}</div>
          </div>
        ) : null}

        <div style={{ display: "grid", gap: 12, marginTop: 12 }}>
          <label style={{ display: "grid", gap: 6 }}>
            <div style={{ fontWeight: 800 }}>Title</div>
            <input
              className="input"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              style={{ padding: 10 }}
            />
          </label>

          <label style={{ display: "grid", gap: 6 }}>
            <div style={{ fontWeight: 800 }}>Description (Details page)</div>
            <textarea
              className="input"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              style={{ padding: 10, minHeight: 120 }}
            />
          </label>

          <label style={{ display: "grid", gap: 6 }}>
            <div style={{ fontWeight: 800 }}>Target URL</div>
            <input
              className="input"
              value={targetUrl}
              onChange={(e) => setTargetUrl(e.target.value)}
              style={{ padding: 10 }}
            />
          </label>

          <label style={{ display: "grid", gap: 6 }}>
            <div style={{ fontWeight: 800 }}>Status</div>
            <select
              className="input"
              value={status}
              onChange={(e) => setStatus(e.target.value)}
              style={{ padding: 10 }}
            >
              <option value="published">published</option>
              <option value="draft">draft</option>
            </select>
          </label>

          {/* IMAGE */}
          <div className="card" style={{ padding: 12 }}>
            <div style={{ fontWeight: 900 }}>Image</div>

            {imgPreview ? (
              <img
                src={imgPreview}
                alt="preview"
                style={{
                  width: "100%",
                  maxWidth: 420,
                  marginTop: 10,
                  borderRadius: 12,
                  border: "1px solid var(--border)",
                }}
              />
            ) : (
              <div style={{ color: "var(--muted)", fontSize: 13, marginTop: 8 }}>
                No image
              </div>
            )}

            <div style={{ marginTop: 10 }}>
              <input
                type="file"
                accept="image/*"
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  if (f) uploadImage(f).catch((x) => setErr(String(x?.message || x)));
                }}
              />
            </div>

            <div style={{ marginTop: 8, opacity: 0.75 }}>
              Stored as: <code>{imageUrl || "(none)"}</code>
            </div>
          </div>

          {/* TAGS */}
          <div className="card" style={{ padding: 12 }}>
            <div style={{ fontWeight: 900 }}>Tags</div>
            <input
              className="input"
              value={tags.join("|")}
              onChange={(e) =>
                setTags(
                  e.target.value
                    .split("|")
                    .map((x) => x.trim())
                    .filter(Boolean)
                )
              }
              placeholder="tag1|tag2|tag3"
              style={{ width: "100%", padding: 10, marginTop: 8 }}
            />
          </div>

          {/* CATEGORIES (backend-driven) */}
          <div className="card" style={{ padding: 12 }}>
            <div style={{ display: "flex", justifyContent: "space-between", gap: 10, alignItems: "center" }}>
              <div style={{ fontWeight: 900 }}>Categories (multiple)</div>
              <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
                <button className="btn" onClick={() => (window.location.href = "/admin/categories")}>
                  Manage categories
                </button>
                <button className="btn" onClick={loadCategories} disabled={categoriesLoading}>
                  {categoriesLoading ? "Refreshing…" : "Refresh"}
                </button>
              </div>
            </div>

            {categoriesLoading ? (
              <div style={{ marginTop: 10, color: "var(--muted)", fontSize: 13 }}>Loading categories…</div>
            ) : categoryOptions.length === 0 ? (
              <div style={{ marginTop: 10, color: "var(--muted)", fontSize: 13 }}>
                No categories found. Create some in <b>Admin → Categories</b>.
              </div>
            ) : (
              <div style={{ display: "grid", gap: 8, marginTop: 10 }}>
                {categoryOptions.map((c) => {
                  const checked = categories.includes(c.name);
                  const disabled = !c.active;

                  return (
                    <label key={c.id} style={{ display: "flex", gap: 10, alignItems: "center", opacity: disabled ? 0.6 : 1 }}>
                      <input
                        type="checkbox"
                        checked={checked}
                        disabled={disabled}
                        onChange={(e) => {
                          setCategories((prev) => {
                            if (e.target.checked) return Array.from(new Set([...prev, c.name]));
                            return prev.filter((x) => x !== c.name);
                          });
                        }}
                      />
                      <span>
                        {c.name}{" "}
                        {!c.active ? <span style={{ color: "var(--muted)", fontSize: 12 }}>(inactive)</span> : null}
                      </span>
                    </label>
                  );
                })}
              </div>
            )}

            {/* if selected categories no longer exist */}
            {selectedButMissing.length ? (
              <div className="card" style={{ marginTop: 12, padding: 10, borderColor: "rgba(255,200,80,.35)", background: "rgba(255,200,80,.08)" }}>
                <div style={{ fontWeight: 900 }}>Note</div>
                <div style={{ color: "var(--muted)", marginTop: 6, fontSize: 13 }}>
                  These selected categories do not exist in the categories table anymore:
                  <div style={{ marginTop: 6, display: "flex", gap: 8, flexWrap: "wrap" }}>
                    {selectedButMissing.map((x) => (
                      <span key={x} className="badge" style={{ padding: "6px 10px" }}>
                        {x}
                      </span>
                    ))}
                  </div>
                  <div style={{ marginTop: 8 }}>
                    They will still be saved unless you unselect them (to avoid accidental data loss).
                  </div>
                </div>
              </div>
            ) : null}
          </div>

          {/* FIELDS */}
          <div className="card" style={{ padding: 12 }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 10 }}>
              <div style={{ fontWeight: 900 }}>Fields (key/value)</div>
              <button
                className="btn"
                onClick={() => setFields((p) => [...p, { key: "", value: "" }])}
              >
                + Add
              </button>
            </div>

            {fields.length === 0 ? (
              <div style={{ marginTop: 10, color: "var(--muted)", fontSize: 13 }}>
                No fields yet.
              </div>
            ) : null}

            {fields.map((f, i) => (
              <div
                key={i}
                style={{
                  display: "grid",
                  gridTemplateColumns: "1fr 1fr auto",
                  gap: 8,
                  marginTop: 10,
                }}
              >
                <input
                  className="input"
                  value={f.key}
                  placeholder="key"
                  onChange={(e) => setField(i, e.target.value, f.value)}
                  style={{ padding: 10 }}
                />
                <input
                  className="input"
                  value={f.value}
                  placeholder="value"
                  onChange={(e) => setField(i, f.key, e.target.value)}
                  style={{ padding: 10 }}
                />
                <button
                  className="btn"
                  onClick={() => setFields((p) => p.filter((_, idx) => idx !== i))}
                >
                  ✕
                </button>
              </div>
            ))}
          </div>
        </div>
      </div>
    </AdminLayout>
  );
}