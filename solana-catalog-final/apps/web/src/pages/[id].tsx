import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/router";
import Link from "next/link";
import { AppHeader } from "../components/AppHeader";
import { AppFooter } from "../components/AppFooter";
import { apiFetch } from "../lib/api";

type Product = {
  id: string;
  title?: string;
  description?: string;
  image_url?: string;
  target_url?: string;
  status?: string;
  updated_at?: string;
  fields?: any;
  [key: string]: any;
};

function resolveImageSrc(raw: string) {
  const u = (raw || "").trim();
  if (!u) return "";
  if (u.startsWith("http://") || u.startsWith("https://")) return u;

  const API_BASE = process.env.NEXT_PUBLIC_API_BASE || "https://api.utrade.vip";
  if (u.startsWith("/uploads/")) return `${API_BASE}${u}`;
  if (!u.startsWith("/")) return `${API_BASE}/uploads/${u}`;
  return `${API_BASE}${u}`;
}

function resolveLink(raw: string) {
  const u = (raw || "").trim();
  if (!u) return "";
  if (u.startsWith("http://") || u.startsWith("https://")) return u;
  if (u.startsWith("www.")) return `https://${u}`;
  if (u.startsWith("/")) return u;
  return `https://${u}`;
}

function buildExtraFields(p: Product) {
  const out: Array<[string, any]> = [];

  // fields obj / JSON string
  let fieldsObj: Record<string, any> | null = null;
  if (p.fields && typeof p.fields === "object") fieldsObj = p.fields;
  if (typeof p.fields === "string") {
    try {
      const parsed = JSON.parse(p.fields);
      if (parsed && typeof parsed === "object") fieldsObj = parsed;
    } catch {}
  }

  if (fieldsObj) {
    for (const [k, v] of Object.entries(fieldsObj)) {
      if (v === null || v === undefined || `${v}`.trim() === "") continue;
      out.push([k, v]);
    }
  }

  // unknown keys (future proof)
  const known = new Set([
    "id",
    "title",
    "description",
    "image_url",
    "target_url",
    "status",
    "updated_at",
    "fields",
  ]);

  for (const [k, v] of Object.entries(p)) {
    if (known.has(k)) continue;
    if (v === null || v === undefined || `${v}`.trim() === "") continue;
    out.push([k, typeof v === "object" ? JSON.stringify(v) : v]);
  }

  // dedupe
  const seen = new Set<string>();
  return out.filter(([k]) => (seen.has(k) ? false : (seen.add(k), true)));
}

export default function ProductDetailPage() {
  const router = useRouter();
  const { id } = router.query;

  const [product, setProduct] = useState<Product | null>(null);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState("");

  useEffect(() => {
    const jwt = typeof window !== "undefined" ? localStorage.getItem("user_jwt") : null;
    if (!jwt) {
      window.location.href = "/";
      return;
    }

    if (!id) return;

    (async () => {
      try {
        setLoading(true);
        setErr("");

        // Option A: Falls Backend /products/:id unterstützt
        // const p = await apiFetch(`/products/${id}`, { method: "GET" }, jwt);

        // Option B: Fallback: alles holen und matchen
        const out = await apiFetch("/products", { method: "GET" }, jwt);
        const items = Array.isArray(out) ? out : out?.items || out?.products || [];
        const found = items.find((x: any) => x.id === id);

        if (!found) throw new Error("Produkt nicht gefunden.");
        setProduct(found);
      } catch (e: any) {
        setErr(e?.message || "Fehler beim Laden");
      } finally {
        setLoading(false);
      }
    })();
  }, [id]);

  const img = useMemo(() => resolveImageSrc(product?.image_url || ""), [product]);
  const link = useMemo(() => resolveLink(product?.target_url || ""), [product]);
  const extra = useMemo(() => (product ? buildExtraFields(product) : []), [product]);

  return (
    <>
      <AppHeader />

      <div className="container">
        <div style={{ display: "flex", justifyContent: "space-between", gap: 12, flexWrap: "wrap", marginTop: 18 }}>
          <Link className="btn" href="/catalog">
            ← Back to catalog
          </Link>

          {link ? (
            <a className="btn btnPrimary" href={link} target="_blank" rel="noreferrer">
              Open link
            </a>
          ) : null}
        </div>

        <div className="card" style={{ marginTop: 14, padding: 18 }}>
          {loading ? (
            <div>Loading…</div>
          ) : err ? (
            <div style={{ color: "var(--muted)" }}>{err}</div>
          ) : product ? (
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 18 }}>
              <div className="card" style={{ padding: 0, overflow: "hidden" }}>
                {img ? (
                  <img src={img} alt={product.title || "Product"} style={{ width: "100%", height: "100%", objectFit: "cover" }} />
                ) : (
                  <div style={{ padding: 18, color: "var(--muted)" }}>No image</div>
                )}
              </div>

              <div>
                <h1 style={{ margin: 0 }}>{product.title || "Untitled"}</h1>

                {product.description ? (
                  <div
                    style={{ marginTop: 10, color: "var(--muted)", lineHeight: 1.6 }}
                    dangerouslySetInnerHTML={{ __html: String(product.description) }}
                  />
                ) : null}

                <div style={{ marginTop: 16 }}>
                  <div style={{ fontWeight: 800, marginBottom: 10 }}>Details</div>

                  {extra.length ? (
                    <div style={{ display: "grid", gap: 8 }}>
                      {extra.map(([k, v]) => (
                        <div key={k} style={{ display: "flex", justifyContent: "space-between", gap: 12, fontSize: 13 }}>
                          <span style={{ color: "var(--muted)" }}>{k}</span>
                          <span style={{ textAlign: "right" }}>{String(v)}</span>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div style={{ color: "var(--muted)" }}>No extra fields.</div>
                  )}
                </div>
              </div>
            </div>
          ) : null}
        </div>
      </div>

      <AppFooter />
    </>
  );
}
