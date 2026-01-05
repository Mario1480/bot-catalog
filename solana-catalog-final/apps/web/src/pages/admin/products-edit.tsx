import { useEffect, useMemo, useState } from "react";
import { apiFetch, apiBase } from "../../lib/api";

function qp(name: string): string {
  if (typeof window === "undefined") return "";
  const u = new URL(window.location.href);
  return u.searchParams.get(name) || "";
}

export default function ProductEditor() {
  const [err, setErr] = useState("");
  const [saving, setSaving] = useState(false);

  const [id, setId] = useState<string>("");
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [imageUrl, setImageUrl] = useState("");
  const [targetUrl, setTargetUrl] = useState("");
  const [status, setStatus] = useState("published");
  const [tags, setTags] = useState<string[]>([]);
  const [fields, setFields] = useState<{ key: string; value: string }[]>([]);

  const token = typeof window !== "undefined" ? localStorage.getItem("admin_jwt") || "" : "";
  const API = apiBase();

  useEffect(() => {
    const existingId = qp("id");
    if (existingId) setId(existingId);
  }, []);

  useEffect(() => {
    (async () => {
      if (!id) return;
      setErr("");
      try {
        const out = await apiFetch(`/admin/products/${id}`, { method: "GET" }, token);
        setTitle(out.title || "");
        setDescription(out.description || "");
        setImageUrl(out.image_url || "");
        setTargetUrl(out.target_url || "");
        setStatus(out.status || "published");
        setTags(out.tags || []);
        setFields((out.fields || []).map((f: any) => ({ key: f.key, value: f.value })));
      } catch (e: any) {
        setErr(e.message || "Failed");
      }
    })();
  }, [id]);

  const imgPreview = useMemo(() => {
    if (!imageUrl) return "";
    if (imageUrl.startsWith("/uploads/")) return `${API}${imageUrl}`;
    return imageUrl;
  }, [imageUrl, API]);

  async function uploadImage(file: File) {
    setErr("");
    const form = new FormData();
    form.append("file", file);

    const res = await fetch(`${API}/admin/uploads/image`, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}` },
      body: form
    });

    const data = await res.json();
    if (!res.ok) throw new Error(data?.error || "Upload failed");

    setImageUrl(data.publicUrl);
  }

  async function save() {
    setErr("");
    setSaving(true);
    try {
      const payload = {
        title,
        description,
        image_url: imageUrl,
        target_url: targetUrl,
        status,
        tags,
        fields
      };

      if (!id) {
        const out = await apiFetch("/admin/products", { method: "POST", body: JSON.stringify(payload) }, token);
        setId(out.id);
        alert("Created");
        window.history.replaceState({}, "", `/admin/products-edit?id=${out.id}`);
      } else {
        await apiFetch(`/admin/products/${id}`, { method: "PUT", body: JSON.stringify(payload) }, token);
        alert("Saved");
      }
    } catch (e: any) {
      setErr(e.message || "Save failed");
    } finally {
      setSaving(false);
    }
  }

  async function del() {
    if (!id) return;
    if (!confirm("Delete this product?")) return;
    setErr("");
    try {
      await apiFetch(`/admin/products/${id}`, { method: "DELETE" }, token);
      alert("Deleted");
      window.location.href = "/admin/products";
    } catch (e: any) {
      setErr(e.message || "Delete failed");
    }
  }

  function setField(i: number, k: string, v: string) {
    const next = [...fields];
    next[i] = { key: k, value: v };
    setFields(next);
  }

  return (
    <div style={{ maxWidth: 900, margin: "40px auto", padding: 16, fontFamily: "system-ui" }}>
      <h1>{id ? "Edit Product" : "Create Product"}</h1>
      {err && <p style={{ color: "crimson" }}>{err}</p>}

      <div style={{ display: "grid", gap: 10 }}>
        <label>
          Title
          <input value={title} onChange={(e) => setTitle(e.target.value)} style={{ width: "100%", padding: 10 }} />
        </label>

        <label>
          Description
          <textarea
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            style={{ width: "100%", padding: 10, minHeight: 90 }}
          />
        </label>

        <label>
          Target URL
          <input value={targetUrl} onChange={(e) => setTargetUrl(e.target.value)} style={{ width: "100%", padding: 10 }} />
        </label>

        <label>
          Status
          <select value={status} onChange={(e) => setStatus(e.target.value)} style={{ width: "100%", padding: 10 }}>
            <option value="published">published</option>
            <option value="draft">draft</option>
          </select>
        </label>

        <div style={{ border: "1px solid #ddd", borderRadius: 12, padding: 12 }}>
          <div style={{ fontWeight: 600 }}>Image</div>
          {imgPreview && (
            <img
              src={imgPreview}
              alt="preview"
              style={{ width: "100%", maxWidth: 420, marginTop: 10, borderRadius: 10 }}
            />
          )}
          <div style={{ marginTop: 10 }}>
            <input
              type="file"
              accept="image/*"
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) uploadImage(f).catch((x) => setErr(String(x.message || x)));
              }}
            />
          </div>
          <div style={{ marginTop: 10, opacity: 0.8 }}>
            Stored as: <code>{imageUrl || "(none)"}</code>
          </div>
        </div>

        <div style={{ border: "1px solid #ddd", borderRadius: 12, padding: 12 }}>
          <div style={{ fontWeight: 600 }}>Tags</div>
          <input
            value={tags.join("|")}
            onChange={(e) => setTags(e.target.value.split("|").map((x) => x.trim()).filter(Boolean))}
            placeholder="tag1|tag2|tag3"
            style={{ width: "100%", padding: 10, marginTop: 8 }}
          />
        </div>

        <div style={{ border: "1px solid #ddd", borderRadius: 12, padding: 12 }}>
          <div style={{ fontWeight: 600, display: "flex", justifyContent: "space-between" }}>
            <span>Fields (key/value)</span>
            <button onClick={() => setFields([...fields, { key: "", value: "" }])} style={{ padding: "6px 10px" }}>
              Add
            </button>
          </div>

          {fields.map((f, i) => (
            <div key={i} style={{ display: "grid", gridTemplateColumns: "1fr 1fr auto", gap: 8, marginTop: 8 }}>
              <input value={f.key} onChange={(e) => setField(i, e.target.value, f.value)} placeholder="Key" style={{ padding: 10 }} />
              <input value={f.value} onChange={(e) => setField(i, f.key, e.target.value)} placeholder="Value" style={{ padding: 10 }} />
              <button onClick={() => setFields(fields.filter((_, idx) => idx !== i))} style={{ padding: "6px 10px" }}>
                X
              </button>
            </div>
          ))}
        </div>

        <div style={{ display: "flex", gap: 10 }}>
          <button onClick={save} disabled={saving} style={{ padding: "10px 14px" }}>
            {saving ? "Saving..." : "Save"}
          </button>
          <button onClick={() => (window.location.href = "/admin/products")} style={{ padding: "10px 14px" }}>
            Back
          </button>
          {id && (
            <button onClick={del} style={{ padding: "10px 14px", background: "#fee", border: "1px solid #f99" }}>
              Delete
            </button>
          )}
        </div>
      </div>
    </div>
  );
}