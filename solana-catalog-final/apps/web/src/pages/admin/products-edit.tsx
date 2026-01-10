import { useEffect, useMemo, useState } from "react";
import dynamic from "next/dynamic";
import { apiFetch, apiBase } from "../../lib/api";
import { AdminLayout } from "../../components/admin/AdminLayout";

type KV = { key: string; value: string };

type Category = {
  id: string;
  name: string;
  sort_order: number;
  active: boolean;
  created_at?: string;
  updated_at?: string;
};

const TinyEditor = dynamic(
  () => import("@tinymce/tinymce-react").then((m) => m.Editor),
  { ssr: false }
);

function qp(name: string): string {
  if (typeof window === "undefined") return "";
  const u = new URL(window.location.href);
  return u.searchParams.get(name) || "";
}

function uniqStrings(arr: string[]) {
  return Array.from(new Set(arr.map((x) => (x || "").trim()).filter(Boolean)));
}

export default function ProductEditor() {
  const [err, setErr] = useState("");
  const [saving, setSaving] = useState(false);

  const [id, setId] = useState("");
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [imageUrl, setImageUrl] = useState("");
  const [targetUrl, setTargetUrl] = useState("");
  const [status, setStatus] = useState("published");

  const [tags, setTags] = useState<string[]>([]);
  const [fields, setFields] = useState<KV[]>([]);
  const [categories, setCategories] = useState<string[]>([]);

  const [catOptions, setCatOptions] = useState<Category[]>([]);
  const [catLoading, setCatLoading] = useState(true);

  const token =
    typeof window !== "undefined" ? localStorage.getItem("admin_jwt") || "" : "";

  const API = apiBase();

  /* ------------------ LOAD ID ------------------ */
  useEffect(() => {
    const existingId = qp("id");
    if (existingId) setId(existingId);
  }, []);

  /* ------------------ LOAD CATEGORIES ------------------ */
  useEffect(() => {
    (async () => {
      setCatLoading(true);
      try {
        const out = await apiFetch(
          `/admin/categories?includeInactive=1`,
          { method: "GET" },
          token
        );

        const list: Category[] = Array.isArray(out) ? out : [];
        list.sort((a, b) => {
          const so = (a.sort_order ?? 0) - (b.sort_order ?? 0);
          if (so !== 0) return so;
          return String(a.name || "").localeCompare(String(b.name || ""));
        });

        setCatOptions(list);
      } catch (e: any) {
        // kein harter Fehler – UI soll trotzdem nutzbar bleiben
        console.warn("Failed to load categories", e?.message || e);
        setCatOptions([]);
      } finally {
        setCatLoading(false);
      }
    })();
  }, [token]);

  /* ------------------ LOAD PRODUCT ------------------ */
  useEffect(() => {
    if (!id) return;

    (async () => {
      setErr("");
      try {
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

        // Categories aus fields ziehen (key === "category")
        const cats = all.filter((f) => f.key === "category").map((f) => f.value);
        setCategories(uniqStrings(cats));

        // category NICHT doppelt in freien fields
        setFields(all.filter((f) => f.key !== "category"));
      } catch (e: any) {
        setErr(e?.message || "Load failed");
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

      const cleanedCategories = uniqStrings(categories);

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

  function toggleCategory(name: string, checked: boolean) {
    setCategories((prev) => {
      const set = new Set(prev);
      if (checked) set.add(name);
      else set.delete(name);
      return Array.from(set);
    });
  }

  // Kategorien die am Produkt hängen, aber evtl. nicht mehr in der DB existieren
  const unknownSelectedCats = useMemo(() => {
    const known = new Set(catOptions.map((c) => c.name));
    return categories.filter((c) => !known.has(c));
  }, [categories, catOptions]);

  return (
    <AdminLayout title={id ? "Edit Product" : "Create Product"}>
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
            <div style={{ fontWeight: 900, fontSize: 18 }}>
              {id ? "Edit Product" : "Create Product"}
            </div>
            <div style={{ opacity: 0.7, marginTop: 4, fontSize: 13 }}>
              {id ? `ID: ${id}` : "New product"}
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

        {err && (
          <div
            className="card"
            style={{
              marginTop: 14,
              padding: 12,
              borderColor: "rgba(255,80,80,.35)",
              background: "rgba(255,80,80,.08)",
            }}
          >
            <div style={{ fontWeight: 900 }}>Error</div>
            <div style={{ opacity: 0.85, marginTop: 6 }}>{err}</div>
          </div>
        )}

        <div style={{ display: "grid", gap: 12, marginTop: 14 }}>
          <label style={{ display: "grid", gap: 6 }}>
            <div style={{ fontWeight: 800 }}>Title</div>
            <input
              className="input"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
            />
          </label>

          <div style={{ display: "grid", gap: 6 }}>
            <div style={{ fontWeight: 800 }}>Description (Details page)</div>
            <div
              style={{
                border: "1px solid var(--border)",
                borderRadius: 12,
                background: "rgba(255,255,255,.04)",
                padding: 8,
              }}
            >
              <TinyEditor
                value={description}
                onEditorChange={(val) => setDescription(val)}
                init={{
                  height: 260,
                  menubar: false,
                  statusbar: false,
                  branding: false,
                  apiKey: "uavsdz2q5s7vg0ihzcdirz8m3988mqb22w6sf15vqv4o395h",
                  plugins: "link lists code",
                  toolbar:
                    "undo redo | bold italic underline | bullist numlist | link | code",
                  content_style:
                    "body { font-family: ui-sans-serif, system-ui, -apple-system, Segoe UI, sans-serif; font-size: 14px; }",
                }}
              />
            </div>
          </div>

          <label style={{ display: "grid", gap: 6 }}>
            <div style={{ fontWeight: 800 }}>Target URL</div>
            <input
              className="input"
              value={targetUrl}
              onChange={(e) => setTargetUrl(e.target.value)}
              placeholder="https://..."
            />
          </label>

          <label style={{ display: "grid", gap: 6 }}>
            <div style={{ fontWeight: 800 }}>Status</div>
            <select
              className="input"
              value={status}
              onChange={(e) => setStatus(e.target.value)}
            >
              <option value="published">published</option>
              <option value="draft">draft</option>
            </select>
          </label>

          <div className="card" style={{ padding: 12 }}>
            <div style={{ fontWeight: 800 }}>Image</div>
            {imgPreview ? (
              <img
                src={imgPreview}
                alt="preview"
                style={{ maxWidth: 420, width: "100%", marginTop: 10, borderRadius: 10 }}
              />
            ) : (
              <div style={{ opacity: 0.7, marginTop: 8 }}>No image yet.</div>
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

          <div className="card" style={{ padding: 12 }}>
            <div style={{ fontWeight: 800 }}>Tags</div>
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
              style={{ marginTop: 8 }}
            />
          </div>

          <div className="card" style={{ padding: 12 }}>
            <div style={{ fontWeight: 800, marginBottom: 8 }}>Categories (multiple)</div>

            {catLoading ? (
              <div style={{ opacity: 0.75 }}>Loading categories…</div>
            ) : catOptions.length === 0 ? (
              <div style={{ opacity: 0.75 }}>
                No categories found. Create some in <b>Admin → Categories</b>.
              </div>
            ) : (
              <div style={{ display: "grid", gap: 8 }}>
                {catOptions.map((c) => {
                  const checked = categories.includes(c.name);

                  // Inactive: allow uncheck if already selected, but prevent selecting new
                  const disabled = !c.active && !checked;

                  return (
                    <label
                      key={c.id}
                      style={{
                        display: "flex",
                        gap: 10,
                        alignItems: "center",
                        opacity: disabled ? 0.5 : 1,
                      }}
                    >
                      <input
                        type="checkbox"
                        checked={checked}
                        disabled={disabled}
                        onChange={(e) => toggleCategory(c.name, e.target.checked)}
                      />
                      <span>
                        {c.name} {!c.active ? <span style={{ opacity: 0.7 }}>(inactive)</span> : null}
                      </span>
                    </label>
                  );
                })}
              </div>
            )}

            {unknownSelectedCats.length ? (
              <div style={{ marginTop: 12, opacity: 0.8, fontSize: 13 }}>
                <div style={{ fontWeight: 800, marginBottom: 6 }}>
                  Selected categories not in DB:
                </div>
                {unknownSelectedCats.map((c) => (
                  <div key={c} style={{ display: "flex", gap: 10, alignItems: "center" }}>
                    <code>{c}</code>
                    <button className="btn" onClick={() => toggleCategory(c, false)}>
                      remove
                    </button>
                  </div>
                ))}
              </div>
            ) : null}
          </div>

          <div className="card" style={{ padding: 12 }}>
            <div
              style={{
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
                gap: 10,
              }}
            >
              <div style={{ fontWeight: 800 }}>Fields (key/value)</div>
              <button
                className="btn"
                onClick={() => setFields((p) => [...p, { key: "", value: "" }])}
              >
                + Add
              </button>
            </div>

            {fields.length === 0 ? (
              <div style={{ marginTop: 10, opacity: 0.7 }}>No fields yet.</div>
            ) : null}

            {fields.map((f, i) => (
              <div
                key={i}
                className="adminFieldRow"
              >
                <input
                  className="input"
                  value={f.key}
                  placeholder="key"
                  onChange={(e) => setField(i, e.target.value, f.value)}
                />
                <input
                  className="input"
                  value={f.value}
                  placeholder="value"
                  onChange={(e) => setField(i, f.key, e.target.value)}
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
