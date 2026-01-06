import { useEffect, useMemo, useState } from "react";
import { apiFetch, apiBase } from "../../lib/api";

const CATEGORY_OPTIONS = [
  "Bots",
  "Signals",
  "Indicators",
  "Education",
  "Tools",
  "Other",
];

type KV = { key: string; value: string };

function qp(name: string): string {
  if (typeof window === "undefined") return "";
  const u = new URL(window.location.href);
  return u.searchParams.get(name) || "";
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

  const token =
    typeof window !== "undefined"
      ? localStorage.getItem("admin_jwt") || ""
      : "";

  const API = apiBase();

  /* ------------------ LOAD ID ------------------ */
  useEffect(() => {
    const existingId = qp("id");
    if (existingId) setId(existingId);
  }, []);

  /* ------------------ LOAD PRODUCT ------------------ */
  useEffect(() => {
    if (!id) return;

    (async () => {
      try {
        const out = await apiFetch(
          `/admin/products/${id}`,
          { method: "GET" },
          token
        );

        setTitle(out.title || "");
        setDescription(out.description || "");
        setImageUrl(out.image_url || "");
        setTargetUrl(out.target_url || "");
        setStatus(out.status || "published");
        setTags(out.tags || []);

        const rawFields = Array.isArray(out.fields) ? out.fields : [];
        const all: KV[] = rawFields.map((f: any) => ({
          key: String(f.key || ""),
          value: String(f.value || ""),
        }));

        // Categories aus fields ziehen
        const cats = all
          .filter((f) => f.key === "category")
          .map((f) => f.value);

        setCategories(Array.from(new Set(cats)));

        // category NICHT doppelt in freien fields
        setFields(all.filter((f) => f.key !== "category"));
      } catch (e: any) {
        setErr(e.message || "Load failed");
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

  /* ------------------ SAVE ------------------ */
  async function save() {
    setSaving(true);
    setErr("");

    try {
      const payload = {
        title,
        description,
        image_url: imageUrl,
        target_url: targetUrl,
        status,
        tags,
        fields: [
          ...fields
            .map((f) => ({
              key: f.key.trim(),
              value: f.value.trim(),
            }))
            .filter((f) => f.key && f.value),

          ...categories.map((c) => ({
            key: "category",
            value: c,
          })),
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
      setErr(e.message || "Save failed");
    } finally {
      setSaving(false);
    }
  }

  /* ------------------ UI ------------------ */
  return (
    <div style={{ maxWidth: 900, margin: "40px auto", padding: 16 }}>
      <h1>{id ? "Edit Product" : "Create Product"}</h1>
      {err && <p style={{ color: "crimson" }}>{err}</p>}

      <div style={{ display: "grid", gap: 12 }}>
        <input
          placeholder="Title"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
        />

        <textarea
          placeholder="Description (Details page)"
          value={description}
          onChange={(e) => setDescription(e.target.value)}
        />

        <input
          placeholder="Target URL"
          value={targetUrl}
          onChange={(e) => setTargetUrl(e.target.value)}
        />

        <select value={status} onChange={(e) => setStatus(e.target.value)}>
          <option value="published">published</option>
          <option value="draft">draft</option>
        </select>

        {/* IMAGE */}
        <div>
          {imgPreview && (
            <img
              src={imgPreview}
              style={{ maxWidth: 300, borderRadius: 8 }}
            />
          )}
          <input
            type="file"
            onChange={(e) =>
              e.target.files && uploadImage(e.target.files[0])
            }
          />
        </div>

        {/* CATEGORIES */}
        <div style={{ border: "1px solid #ddd", padding: 12 }}>
          <strong>Categories</strong>
          {CATEGORY_OPTIONS.map((c) => (
            <label key={c} style={{ display: "block" }}>
              <input
                type="checkbox"
                checked={categories.includes(c)}
                onChange={(e) =>
                  setCategories((prev) =>
                    e.target.checked
                      ? [...prev, c]
                      : prev.filter((x) => x !== c)
                  )
                }
              />{" "}
              {c}
            </label>
          ))}
        </div>

        {/* FIELDS */}
        <div>
          <strong>Fields</strong>
          {fields.map((f, i) => (
            <div key={i} style={{ display: "flex", gap: 6 }}>
              <input
                value={f.key}
                placeholder="key"
                onChange={(e) =>
                  setFields((p) => {
                    const n = [...p];
                    n[i].key = e.target.value;
                    return n;
                  })
                }
              />
              <input
                value={f.value}
                placeholder="value"
                onChange={(e) =>
                  setFields((p) => {
                    const n = [...p];
                    n[i].value = e.target.value;
                    return n;
                  })
                }
              />
              <button onClick={() => setFields(fields.filter((_, x) => x !== i))}>
                ✕
              </button>
            </div>
          ))}
          <button onClick={() => setFields([...fields, { key: "", value: "" }])}>
            + Add field
          </button>
        </div>

        <button disabled={saving} onClick={save}>
          {saving ? "Saving…" : "Save"}
        </button>
      </div>
    </div>
  );
}