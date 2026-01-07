import { useEffect, useMemo, useState } from "react";
import { apiBase, apiFetch } from "../../lib/api";

const CATEGORY_OPTIONS = ["Bots", "Signals", "Indicators", "Education", "Tools", "Other"] as const;

type KV = { key: string; value: string };

function qp(name: string): string {
  if (typeof window === "undefined") return "";
  const u = new URL(window.location.href);
  return u.searchParams.get(name) || "";
}

function normalizeTags(input: string): string[] {
  return input
    .split("|")
    .map((x) => x.trim())
    .filter(Boolean);
}

function normalizeUrl(input: string): string {
  const v = (input || "").trim();
  return v;
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

  const token =
    typeof window !== "undefined" ? localStorage.getItem("admin_jwt") || "" : "";

  const API = apiBase();

  // ---- redirect if no admin token
  useEffect(() => {
    if (typeof window === "undefined") return;
    if (!token) window.location.href = "/admin/login";
  }, [token]);

  // ---- load id from query
  useEffect(() => {
    const existingId = qp("id");
    if (existingId) setId(existingId);
  }, []);

  // ---- load product
  useEffect(() => {
    if (!id) return;

    (async () => {
      setErr("");
      setLoading(true);
      try {
        const out = await apiFetch(`/admin/products/${id}`, { method: "GET" }, token);

        setTitle(out?.title || "");
        setDescription(out?.description || "");
        setImageUrl(out?.image_url || "");
        setTargetUrl(out?.target_url || "");
        setStatus((out?.status || "published") === "draft" ? "draft" : "published");
        setTags(Array.isArray(out?.tags) ? out.tags : []);

        const rawFields = Array.isArray(out?.fields) ? out.fields : [];
        const all: KV[] = rawFields.map((f: any) => ({
          key: String(f?.key || ""),
          value: String(f?.value || ""),
        }));

        // Categories come from fields where key === "category" (multiple allowed)
        const cats = all.filter((f) => f.key === "category").map((f) => f.value);
        setCategories(Array.from(new Set(cats.filter(Boolean))));

        // Remove category from free fields list to avoid duplicates
        setFields(all.filter((f) => f.key !== "category"));
      } catch (e: any) {
        setErr(e?.message || "Load failed");
      } finally {
        setLoading(false);
      }
    })();
  }, [id, token]);

  // ---- image preview
  const imgPreview = useMemo(() => {
    const v = (imageUrl || "").trim();
    if (!v) return "";
    if (v.startsWith("http://") || v.startsWith("https://")) return v;
    if (v.startsWith("/uploads/")) return `${API}${v}`;
    return `${API}/uploads/${v}`;
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

    // API returns: { publicUrl: "/uploads/xxx.png" } (expected)
    setImageUrl(String(data?.publicUrl || ""));
  }

  function setField(i: number, key: string, value: string) {
    setFields((prev) => {
      const next = [...prev];
      next[i] = { key, value };
      return next;
    });
  }

  async function save() {
    setSaving(true);
    setErr("");
    try {
      const cleanedFields = fields
        .map((f) => ({ key: (f.key || "").trim(), value: (f.value || "").trim() }))
        .filter((f) => f.key && f.value)
        .filter((f) => f.key !== "category"); // avoid duplication

      const cleanedCategories = Array.from(
        new Set(categories.map((c) => (c || "").trim()).filter(Boolean))
      );

      const payload = {
        title: (title || "").trim(),
        description: (description || "").trim(),
        image_url: (imageUrl || "").trim(),
        target_url: normalizeUrl(targetUrl),
        status,
        tags: Array.from(new Set(tags.map((t) => (t || "").trim()).filter(Boolean))),
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
        const newId = out?.id;
        if (!newId) throw new Error("Create succeeded but no id returned");
        window.location.href = `/admin/products-edit?id=${newId}`;
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

  async function del() {
    if (!id) return;
    if (!confirm("Delete this product?")) return;

    setErr("");
    setSaving(true);
    try {
      await apiFetch(`/admin/products/${id}`, { method: "DELETE" }, token);
      alert("Deleted");
      window.location.href = "/admin/products";
    } catch (e: any) {
      setErr(e?.message || "Delete failed");
    } finally {
      setSaving(false);
    }
  }

  const tagsString = useMemo(() => tags.join("|"), [tags]);

  return (
    <div style={{ maxWidth: 980, margin: "40px auto", padding: 16, fontFamily: "system-ui" }}>
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          gap: 12,
          alignItems: "center",
          flexWrap: "wrap",
        }}
      >
        <h1 style={{ margin: 0 }}>{id ? "Edit Product" : "Create Product"}</h1>

        <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
          <button
            onClick={() => (window.location.href = "/admin/products")}
            style={{ padding: "10px 14px" }}
            disabled={saving}
          >
            Back
          </button>

          {id ? (
            <button
              onClick={del}
              style={{ padding: "10px 14px", background: "#fee", border: "1px solid #f99" }}
              disabled={saving}
            >
              Delete
            </button>
          ) : null}

          <button disabled={saving} onClick={save} style={{ padding: "10px 14px" }}>
            {saving ? "Saving…" : "Save"}
          </button>
        </div>
      </div>

      {loading ? <p style={{ opacity: 0.7 }}>Loading…</p> : null}
      {err ? <p style={{ color: "crimson" }}>{err}</p> : null}

      <div style={{ display: "grid", gap: 12, marginTop: 12 }}>
        <label style={{ display: "grid", gap: 6 }}>
          <div style={{ fontWeight: 700 }}>Title</div>
          <input value={title} onChange={(e) => setTitle(e.target.value)} style={{ padding: 10 }} />
        </label>

        <label style={{ display: "grid", gap: 6 }}>
          <div style={{ fontWeight: 700 }}>Description (Details page)</div>
          <textarea
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            style={{ padding: 10, minHeight: 120 }}
          />
        </label>

        <label style={{ display: "grid", gap: 6 }}>
          <div style={{ fontWeight: 700 }}>Target URL</div>
          <input value={targetUrl} onChange={(e) => setTargetUrl(e.target.value)} style={{ padding: 10 }} />
        </label>

        <label style={{ display: "grid", gap: 6 }}>
          <div style={{ fontWeight: 700 }}>Status</div>
          <select value={status} onChange={(e) => setStatus(e.target.value as any)} style={{ padding: 10 }}>
            <option value="published">published</option>
            <option value="draft">draft</option>
          </select>
        </label>

        {/* IMAGE */}
        <div style={{ border: "1px solid #ddd", borderRadius: 12, padding: 12 }}>
          <div style={{ fontWeight: 800 }}>Image</div>
          {imgPreview ? (
            <img
              src={imgPreview}
              alt="preview"
              style={{ maxWidth: 360, width: "100%", marginTop: 10, borderRadius: 10 }}
            />
          ) : null}

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
        <div style={{ border: "1px solid #ddd", borderRadius: 12, padding: 12 }}>
          <div style={{ fontWeight: 800 }}>Tags</div>
          <input
            value={tagsString}
            onChange={(e) => setTags(normalizeTags(e.target.value))}
            placeholder="tag1|tag2|tag3"
            style={{ width: "100%", padding: 10, marginTop: 8 }}
          />
        </div>

        {/* CATEGORIES */}
        <div style={{ border: "1px solid #ddd", borderRadius: 12, padding: 12 }}>
          <div style={{ fontWeight: 800, marginBottom: 8 }}>Categories (multiple)</div>
          <div style={{ display: "grid", gap: 8 }}>
            {CATEGORY_OPTIONS.map((c) => {
              const checked = categories.includes(c);
              return (
                <label key={c} style={{ display: "flex", gap: 10, alignItems: "center" }}>
                  <input
                    type="checkbox"
                    checked={checked}
                    onChange={(e) => {
                      setCategories((prev) => {
                        if (e.target.checked) return Array.from(new Set([...prev, c]));
                        return prev.filter((x) => x !== c);
                      });
                    }}
                  />
                  <span>{c}</span>
                </label>
              );
            })}
          </div>
        </div>

        {/* FIELDS */}
        <div style={{ border: "1px solid #ddd", borderRadius: 12, padding: 12 }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 10 }}>
            <div style={{ fontWeight: 800 }}>Fields (key/value)</div>
            <button
              onClick={() => setFields((p) => [...p, { key: "", value: "" }])}
              style={{ padding: "8px 12px" }}
              disabled={saving}
            >
              + Add
            </button>
          </div>

          {fields.length === 0 ? <div style={{ marginTop: 10, opacity: 0.7 }}>No fields yet.</div> : null}

          {fields.map((f, i) => (
            <div key={i} style={{ display: "grid", gridTemplateColumns: "1fr 1fr auto", gap: 8, marginTop: 10 }}>
              <input
                value={f.key}
                placeholder="key"
                onChange={(e) => setField(i, e.target.value, f.value)}
                style={{ padding: 10 }}
              />
              <input
                value={f.value}
                placeholder="value"
                onChange={(e) => setField(i, f.key, e.target.value)}
                style={{ padding: 10 }}
              />
              <button
                onClick={() => setFields((p) => p.filter((_, idx) => idx !== i))}
                style={{ padding: "8px 12px" }}
                disabled={saving}
              >
                ✕
              </button>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}