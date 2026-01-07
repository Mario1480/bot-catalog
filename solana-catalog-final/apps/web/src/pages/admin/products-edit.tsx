import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { apiFetch, apiBase } from "../../lib/api";
import { AdminLayout } from "../../components/admin/AdminLayout";

const CATEGORY_OPTIONS = ["Bots", "Signals", "Indicators", "Education", "Tools", "Other"];

type KV = { key: string; value: string };

function qp(name: string): string {
  if (typeof window === "undefined") return "";
  const u = new URL(window.location.href);
  return u.searchParams.get(name) || "";
}

function uniq(arr: string[]) {
  return Array.from(new Set(arr.map((x) => x.trim()).filter(Boolean)));
}

export default function ProductEditor() {
  const [err, setErr] = useState("");
  const [saving, setSaving] = useState(false);
  const [loading, setLoading] = useState(false);

  const [id, setId] = useState("");
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [imageUrl, setImageUrl] = useState("");
  const [targetUrl, setTargetUrl] = useState("");
  const [status, setStatus] = useState<"published" | "draft">("published");

  const [tags, setTags] = useState<string[]>([]);
  const [fields, setFields] = useState<KV[]>([]);
  const [categories, setCategories] = useState<string[]>([]);

  const token = typeof window !== "undefined" ? localStorage.getItem("admin_jwt") || "" : "";
  const API = apiBase();

  /* ------------------ Load ID ------------------ */
  useEffect(() => {
    const existingId = qp("id");
    if (existingId) setId(existingId);
  }, []);

  /* ------------------ Load Product ------------------ */
  useEffect(() => {
    if (!id) return;

    (async () => {
      setErr("");
      setLoading(true);
      try {
        const out = await apiFetch(`/admin/products/${id}`, { method: "GET" }, token);

        setTitle(out.title || "");
        setDescription(out.description || "");
        setImageUrl(out.image_url || "");
        setTargetUrl(out.target_url || "");
        setStatus((out.status || "published") === "draft" ? "draft" : "published");
        setTags(Array.isArray(out.tags) ? out.tags : []);

        const rawFields = Array.isArray(out.fields) ? out.fields : [];
        const all: KV[] = rawFields.map((f: any) => ({
          key: String(f.key || "").trim(),
          value: String(f.value || "").trim(),
        }));

        // categories aus fields ziehen (mehrfach erlaubt)
        const cats = all.filter((f) => f.key === "category").map((f) => f.value);
        setCategories(uniq(cats));

        // category NICHT doppelt in freien fields
        setFields(all.filter((f) => f.key !== "category"));
      } catch (e: any) {
        setErr(e?.message || "Load failed");
      } finally {
        setLoading(false);
      }
    })();
  }, [id, token]);

  /* ------------------ Image Preview ------------------ */
  const imgPreview = useMemo(() => {
    if (!imageUrl) return "";
    if (imageUrl.startsWith("http://") || imageUrl.startsWith("https://")) return imageUrl;
    if (imageUrl.startsWith("/uploads/")) return `${API}${imageUrl}`;
    if (imageUrl.startsWith("/")) return `${API}${imageUrl}`;
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

    const data = await res.json();
    if (!res.ok) throw new Error(data?.error || "Upload failed");

    setImageUrl(data.publicUrl);
  }

  /* ------------------ Save ------------------ */
  async function save() {
    setSaving(true);
    setErr("");

    try {
      const cleanFields = fields
        .map((f) => ({ key: (f.key || "").trim(), value: (f.value || "").trim() }))
        .filter((f) => f.key && f.value);

      const cleanCats = uniq(categories);

      const payload = {
        title: title.trim(),
        description: description || "",
        image_url: imageUrl || "",
        target_url: targetUrl.trim(),
        status,
        tags: uniq(tags),
        fields: [
          ...cleanFields,
          ...cleanCats.map((c) => ({ key: "category", value: c })),
        ],
      };

      if (!id) {
        const out = await apiFetch("/admin/products", { method: "POST", body: JSON.stringify(payload) }, token);
        window.location.href = `/admin/products-edit?id=${out.id}`;
      } else {
        await apiFetch(`/admin/products/${id}`, { method: "PUT", body: JSON.stringify(payload) }, token);
        alert("Saved");
      }
    } catch (e: any) {
      setErr(e?.message || "Save failed");
    } finally {
      setSaving(false);
    }
  }

  async function del() {
    if (!id) return;
    if (!confirm("Delete this product?")) return;

    setErr("");
    setSaving(true);
    try {
      await apiFetch(`/admin/products/${id}`, { method: "DELETE" }, token);
      window.location.href = "/admin/products";
    } catch (e: any) {
      setErr(e?.message || "Delete failed");
    } finally {
      setSaving(false);
    }
  }

  function setField(i: number, next: KV) {
    setFields((prev) => {
      const copy = [...prev];
      copy[i] = next;
      return copy;
    });
  }

  return (
    <AdminLayout title={id ? "Edit Product" : "Create Product"}>
      {/* Top actions */}
      <div className="card" style={{ padding: 16, marginBottom: 16, display: "flex", gap: 10, flexWrap: "wrap", justifyContent: "space-between" }}>
        <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
          <Link className="btn" href="/admin/products">
            ← Back
          </Link>
          <div style={{ fontWeight: 900, fontSize: 18 }}>
            {id ? "Edit Product" : "Create Product"}
          </div>
          {loading ? <span style={{ color: "var(--muted)" }}>Loading…</span> : null}
        </div>

        <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
          {id ? (
            <button className="btn" onClick={del} disabled={saving} style={{ borderColor: "rgba(255,80,80,.35)" }}>
              Delete
            </button>
          ) : null}

          <button className="btn btnPrimary" onClick={save} disabled={saving || loading}>
            {saving ? "Saving…" : "Save"}
          </button>
        </div>
      </div>

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

      {/* Form */}
      <div style={{ display: "grid", gap: 14 }}>
        {/* Basics */}
        <div className="card" style={{ padding: 16 }}>
          <div style={{ fontWeight: 900, marginBottom: 10 }}>Basics</div>

          <div style={{ display: "grid", gap: 10 }}>
            <label style={{ display: "grid", gap: 6 }}>
              <span style={{ color: "var(--muted)", fontSize: 12 }}>Title</span>
              <input className="input" value={title} onChange={(e) => setTitle(e.target.value)} />
            </label>

            <label style={{ display: "grid", gap: 6 }}>
              <span style={{ color: "var(--muted)", fontSize: 12 }}>Target URL</span>
              <input className="input" value={targetUrl} onChange={(e) => setTargetUrl(e.target.value)} />
            </label>

            <label style={{ display: "grid", gap: 6 }}>
              <span style={{ color: "var(--muted)", fontSize: 12 }}>Status</span>
              <select className="input" value={status} onChange={(e) => setStatus(e.target.value as any)}>
                <option value="published">published</option>
                <option value="draft">draft</option>
              </select>
            </label>
          </div>
        </div>

        {/* Description */}
        <div className="card" style={{ padding: 16 }}>
          <div style={{ fontWeight: 900, marginBottom: 10 }}>Description (Details page)</div>
          <textarea
            className="input"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            style={{ minHeight: 120, resize: "vertical" }}
            placeholder="Shown in the Details modal/page"
          />
        </div>

        {/* Image */}
        <div className="card" style={{ padding: 16 }}>
          <div style={{ fontWeight: 900, marginBottom: 10 }}>Image</div>

          {imgPreview ? (
            <img
              src={imgPreview}
              alt="preview"
              style={{
                width: "100%",
                maxWidth: 520,
                borderRadius: 12,
                border: "1px solid var(--border)",
                marginBottom: 10,
              }}
            />
          ) : (
            <div style={{ color: "var(--muted)", fontSize: 13, marginBottom: 10 }}>No image yet</div>
          )}

          <input
            type="file"
            accept="image/*"
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (!f) return;
              uploadImage(f).catch((x) => setErr(String(x?.message || x)));
            }}
          />

          <div style={{ marginTop: 10, color: "var(--muted)", fontSize: 12 }}>
            Stored as: <code>{imageUrl || "(none)"}</code>
          </div>
        </div>

        {/* Tags */}
        <div className="card" style={{ padding: 16 }}>
          <div style={{ fontWeight: 900, marginBottom: 10 }}>Tags</div>
          <input
            className="input"
            value={tags.join("|")}
            onChange={(e) => setTags(e.target.value.split("|").map((x) => x.trim()).filter(Boolean))}
            placeholder="tag1|tag2|tag3"
          />
          <div style={{ marginTop: 8, color: "var(--muted)", fontSize: 12 }}>
            Use <code>|</code> to separate tags.
          </div>
        </div>

        {/* Categories */}
        <div className="card" style={{ padding: 16 }}>
          <div style={{ fontWeight: 900, marginBottom: 10 }}>Categories</div>
          <div style={{ display: "grid", gap: 10 }}>
            {CATEGORY_OPTIONS.map((c) => {
              const checked = categories.includes(c);
              return (
                <label key={c} style={{ display: "flex", alignItems: "center", gap: 10 }}>
                  <input
                    type="checkbox"
                    checked={checked}
                    onChange={(e) => {
                      setCategories((prev) => {
                        if (e.target.checked) return uniq([...prev, c]);
                        return prev.filter((x) => x !== c);
                      });
                    }}
                  />
                  <span>{c}</span>
                </label>
              );
            })}
          </div>

          <div style={{ marginTop: 10, color: "var(--muted)", fontSize: 12 }}>
            Saved as multiple <code>fields</code> rows: <code>key=category</code>.
          </div>
        </div>

        {/* Fields */}
        <div className="card" style={{ padding: 16 }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 10 }}>
            <div style={{ fontWeight: 900 }}>Fields (key/value)</div>
            <button className="btn" onClick={() => setFields((p) => [...p, { key: "", value: "" }])}>
              + Add field
            </button>
          </div>

          {fields.length === 0 ? (
            <div style={{ marginTop: 10, color: "var(--muted)", fontSize: 13 }}>No custom fields yet.</div>
          ) : (
            <div style={{ display: "grid", gap: 10, marginTop: 12 }}>
              {fields.map((f, i) => (
                <div
                  key={i}
                  style={{
                    display: "grid",
                    gridTemplateColumns: "1fr 1fr auto",
                    gap: 10,
                    alignItems: "center",
                  }}
                >
                  <input
                    className="input"
                    value={f.key}
                    placeholder="Key"
                    onChange={(e) => setField(i, { key: e.target.value, value: f.value })}
                  />
                  <input
                    className="input"
                    value={f.value}
                    placeholder="Value"
                    onChange={(e) => setField(i, { key: f.key, value: e.target.value })}
                  />
                  <button className="btn" onClick={() => setFields((prev) => prev.filter((_, idx) => idx !== i))}>
                    ✕
                  </button>
                </div>
              ))}
            </div>
          )}

          <div style={{ marginTop: 10, color: "var(--muted)", fontSize: 12 }}>
            Note: Do not use <code>category</code> here — categories are managed above.
          </div>
        </div>
      </div>
    </AdminLayout>
  );
}