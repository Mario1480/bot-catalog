import { useEffect, useMemo, useState } from "react";
import { AppHeader } from "../components/AppHeader";
import { WalletConnect } from "../components/WalletConnect";
import { apiFetch } from "../lib/api";

type Product = {
  id: string;
  name?: string;
  title?: string;
  description?: string;

  imageUrl?: string; // normalized
  linkUrl?: string;  // normalized

  fields?: Record<string, any>; // normalized
  tags?: string[];
  category?: string;
  createdAt?: string;

  _raw?: any; // debug / safety
};

type SortKey = "newest" | "az" | "za";

const isObj = (v: any) => v && typeof v === "object" && !Array.isArray(v);

function toStr(v: any) {
  if (v === null || v === undefined) return "";
  return String(v).trim();
}

function safeJsonParse(s: string) {
  try {
    return JSON.parse(s);
  } catch {
    return null;
  }
}

/**
 * Find first "string-ish" value in object by trying:
 * - exact keys
 * - regex search in all keys (case-insensitive)
 * - nested objects 1-level deep
 */
function findString(raw: any, exactKeys: string[], keyRegex?: RegExp): string {
  if (!raw) return "";

  // 1) exact keys
  for (const k of exactKeys) {
    const v = raw?.[k];
    const s = toStr(v);
    if (s) return s;
  }

  // 2) regex over keys (top-level)
  if (keyRegex && isObj(raw)) {
    for (const [k, v] of Object.entries(raw)) {
      if (!keyRegex.test(k)) continue;
      const s = toStr(v);
      if (s) return s;
    }
  }

  // 3) nested 1-level
  if (keyRegex && isObj(raw)) {
    for (const v of Object.values(raw)) {
      if (!isObj(v)) continue;
      for (const [k2, v2] of Object.entries(v)) {
        if (!keyRegex.test(k2)) continue;
        const s = toStr(v2);
        if (s) return s;
      }
    }
  }

  return "";
}

function fieldsToRecord(v: any): Record<string, any> {
  if (!v) return {};

  // already object
  if (isObj(v)) return v as Record<string, any>;

  // json string
  if (typeof v === "string") {
    const parsed = safeJsonParse(v.trim());
    if (parsed) return fieldsToRecord(parsed);
    return {};
  }

  // array like [{key,value}] or [{name,value}]
  if (Array.isArray(v)) {
    const out: Record<string, any> = {};
    for (const item of v) {
      if (!item) continue;
      const k = toStr(item.key ?? item.name ?? item.field ?? item.label);
      const val = item.value ?? item.val ?? item.data;
      if (k) out[k] = val;
    }
    return out;
  }

  return {};
}

function normalizeProduct(raw: any): Product {
  const id = toStr(raw?.id ?? raw?._id ?? raw?.uuid ?? raw?.productId);

  const title = toStr(raw?.name ?? raw?.title ?? raw?.product_name ?? raw?.productTitle) || "Untitled";
  const desc = toStr(raw?.description ?? raw?.desc ?? raw?.details ?? raw?.text ?? raw?.content);

  // fields / metadata / extra fields
  const fieldsCandidate =
    raw?.fields ??
    raw?.extraFields ??
    raw?.extra_fields ??
    raw?.metadata ??
    raw?.meta ??
    raw?.attributes ??
    raw?.data ??
    {};

  const fields = fieldsToRecord(fieldsCandidate);

  // image string detection (many possible keys)
  const imageUrl =
    findString(
      raw,
      ["imageUrl", "image_url", "image", "imagePath", "image_path", "thumbnail", "thumb", "photo", "picture", "img"],
      /image|img|thumb|thumbnail|photo|picture/i
    ) ||
    findString(
      fields,
      ["imageUrl", "image_url", "image", "imagePath", "image_path", "thumbnail", "thumb", "photo", "picture", "img"],
      /image|img|thumb|thumbnail|photo|picture/i
    );

  // link string detection (many possible keys)
  const linkUrl =
    findString(
      raw,
      ["linkUrl", "link_url", "link", "url", "website", "web", "href", "checkout", "shop", "productUrl", "product_url"],
      /link|url|website|href|shop|checkout/i
    ) ||
    findString(
      fields,
      ["linkUrl", "link_url", "link", "url", "website", "web", "href", "checkout", "shop", "productUrl", "product_url"],
      /link|url|website|href|shop|checkout/i
    );

  // createdAt
  const createdAt = toStr(raw?.createdAt ?? raw?.created_at ?? raw?.created ?? raw?.createdOn ?? raw?.created_on);

  // tags/category
  const tagsRaw = raw?.tags ?? fields?.tags;
  const tags =
    Array.isArray(tagsRaw)
      ? tagsRaw.map((t: any) => toStr(t)).filter(Boolean)
      : typeof tagsRaw === "string"
        ? tagsRaw.split(",").map((x: string) => x.trim()).filter(Boolean)
        : [];

  const category = toStr(raw?.category ?? raw?.cat ?? fields?.category);

  return {
    id: id || title, // fallback (avoid empty key crashes)
    name: title,
    title: title,
    description: desc,
    imageUrl: toStr(imageUrl),
    linkUrl: toStr(linkUrl),
    fields,
    tags,
    category,
    createdAt: createdAt || undefined,
    _raw: raw,
  };
}

function normalizeText(s: any) {
  return toStr(s).toLowerCase().trim();
}

function getProductName(p: Product) {
  return (p.name || p.title || "Untitled").toString();
}

function getImageSrc(p: Product) {
  const u = toStr(p.imageUrl);
  if (!u) return "";

  // absolute
  if (u.startsWith("http://") || u.startsWith("https://")) return u;

  // already "/uploads/.."
  if (u.startsWith("/")) return u;

  // "uploads/..."
  if (u.startsWith("uploads/")) return `/${u}`;

  // filename
  return `/uploads/${u}`;
}

function getLink(p: Product) {
  const u = toStr(p.linkUrl);
  if (!u) return "";
  return u;
}

export default function CatalogPage() {
  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState("");

  const [q, setQ] = useState("");
  const [sort, setSort] = useState<SortKey>("newest");

  const [selectedCategory, setSelectedCategory] = useState<string>("All");
  const [selectedTag, setSelectedTag] = useState<string>("All");

  useEffect(() => {
    const jwt = typeof window !== "undefined" ? localStorage.getItem("user_jwt") : null;
    if (!jwt) {
      window.location.href = "/";
      return;
    }

    (async () => {
      try {
        setLoading(true);
        setErr("");

        const out = await apiFetch("/products", { method: "GET" }, jwt || undefined);
        const items = Array.isArray(out) ? out : out?.items || out?.products || [];

        setProducts((items || []).map(normalizeProduct));
      } catch (e: any) {
        setErr(e?.message || "Failed to load products");
        if ((e?.message || "").toLowerCase().includes("unauthorized")) {
          localStorage.removeItem("user_jwt");
          window.location.href = "/";
        }
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  const categories = useMemo(() => {
    const set = new Set<string>();
    for (const p of products) {
      const c = toStr(p.category || p.fields?.category);
      if (c) set.add(c);
    }
    return ["All", ...Array.from(set).sort((a, b) => a.localeCompare(b))];
  }, [products]);

  const tags = useMemo(() => {
    const set = new Set<string>();
    for (const p of products) {
      const t1: string[] = Array.isArray(p.tags) ? p.tags : [];
      const t2raw = p.fields?.tags;
      const t2: string[] =
        Array.isArray(t2raw) ? t2raw.map((x: any) => toStr(x)).filter(Boolean)
        : typeof t2raw === "string" ? t2raw.split(",").map((x: string) => x.trim()).filter(Boolean)
        : [];
      for (const t of [...t1, ...t2]) {
        const tt = toStr(t);
        if (tt) set.add(tt);
      }
    }
    return ["All", ...Array.from(set).sort((a, b) => a.localeCompare(b))];
  }, [products]);

  const filtered = useMemo(() => {
    const qq = normalizeText(q);

    let list = products.filter((p) => {
      const name = normalizeText(getProductName(p));
      const desc = normalizeText(p.description);
      const cat = normalizeText(p.category || p.fields?.category);

      const t = [
        ...(Array.isArray(p.tags) ? p.tags : []),
        ...(Array.isArray(p.fields?.tags) ? p.fields.tags : []),
      ].map(normalizeText);

      const matchQ =
        !qq ||
        name.includes(qq) ||
        desc.includes(qq) ||
        cat.includes(qq) ||
        t.some((x) => x.includes(qq));

      const matchCategory =
        selectedCategory === "All" ||
        toStr(p.category || p.fields?.category) === selectedCategory;

      const matchTag =
        selectedTag === "All" ||
        (Array.isArray(p.tags) && p.tags.includes(selectedTag)) ||
        (Array.isArray(p.fields?.tags) && p.fields.tags.includes(selectedTag));

      return matchQ && matchCategory && matchTag;
    });

    if (sort === "az") {
      list = list.sort((a, b) => getProductName(a).localeCompare(getProductName(b)));
    } else if (sort === "za") {
      list = list.sort((a, b) => getProductName(b).localeCompare(getProductName(a)));
    } else {
      list = list.sort((a, b) => {
        const da = new Date(a.createdAt || 0).getTime();
        const db = new Date(b.createdAt || 0).getTime();
        return db - da;
      });
    }

    return list;
  }, [products, q, sort, selectedCategory, selectedTag]);

  return (
    <>
      <AppHeader />

      <div className="container">
        <div className="card" style={{ padding: 16, marginBottom: 16 }}>
          <div style={{ display: "flex", gap: 12, alignItems: "center", justifyContent: "space-between", flexWrap: "wrap" }}>
            <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
              <div style={{ fontSize: 20, fontWeight: 900, letterSpacing: -0.3 }}>Catalog</div>
              <div style={{ color: "var(--muted)", fontSize: 13 }}>
                {loading ? "Loading products…" : `${filtered.length} item(s)`}
              </div>
            </div>

            <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
              <WalletConnect />

              <select className="input" style={{ width: 180 }} value={sort} onChange={(e) => setSort(e.target.value as SortKey)}>
                <option value="newest">Sort: Newest</option>
                <option value="az">Sort: A → Z</option>
                <option value="za">Sort: Z → A</option>
              </select>
            </div>
          </div>
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "280px 1fr", gap: 16 }}>
          <aside className="card" style={{ padding: 16, height: "fit-content", position: "sticky", top: 88 }}>
            <div style={{ fontWeight: 900, marginBottom: 10 }}>Search</div>
            <input className="input" placeholder="Search products…" value={q} onChange={(e) => setQ(e.target.value)} />

            <div style={{ height: 14 }} />

            <div style={{ fontWeight: 900, marginBottom: 10 }}>Filters</div>

            <div style={{ display: "grid", gap: 10 }}>
              <div>
                <div style={{ fontSize: 12, color: "var(--muted)", marginBottom: 6 }}>Category</div>
                <select className="input" value={selectedCategory} onChange={(e) => setSelectedCategory(e.target.value)}>
                  {categories.map((c) => (
                    <option key={c} value={c}>{c}</option>
                  ))}
                </select>
              </div>

              <div>
                <div style={{ fontSize: 12, color: "var(--muted)", marginBottom: 6 }}>Tag</div>
                <select className="input" value={selectedTag} onChange={(e) => setSelectedTag(e.target.value)}>
                  {tags.map((t) => (
                    <option key={t} value={t}>{t}</option>
                  ))}
                </select>
              </div>

              <button
                className="btn"
                onClick={() => {
                  setQ("");
                  setSelectedCategory("All");
                  setSelectedTag("All");
                  setSort("newest");
                }}
              >
                Reset filters
              </button>
            </div>

            <div style={{ height: 18 }} />

            <div className="badge">
              <span className="badgeDot" />
              Token-gated access active
            </div>
          </aside>

          <main>
            {err && (
              <div className="card" style={{ padding: 14, marginBottom: 14, borderColor: "rgba(255,80,80,.35)", background: "rgba(255,80,80,.08)" }}>
                <div style={{ fontWeight: 900 }}>Error</div>
                <div style={{ color: "var(--muted)", marginTop: 6 }}>{err}</div>
              </div>
            )}

            {loading ? (
              <div className="card" style={{ padding: 18 }}>Loading…</div>
            ) : filtered.length === 0 ? (
              <div className="card" style={{ padding: 18 }}>
                <div style={{ fontWeight: 900 }}>No results</div>
                <div style={{ color: "var(--muted)", marginTop: 6 }}>Try a different search or reset filters.</div>
              </div>
            ) : (
              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(260px, 1fr))", gap: 14 }}>
                {filtered.map((p) => {
                  const img = getImageSrc(p);
                  const link = getLink(p);
                  const title = getProductName(p);
                  const desc = toStr(p.description);

                  // show useful extra fields (avoid repeating known keys)
                  const meta =
                    p.fields && isObj(p.fields)
                      ? Object.entries(p.fields)
                          .filter(([k, v]) => {
                            const kk = k.toLowerCase();
                            if (!toStr(v)) return false;
                            if (["name", "title", "description", "desc", "image", "imageurl", "image_url", "link", "linkurl", "link_url", "url", "website", "web", "tags", "category"].includes(kk)) {
                              return false;
                            }
                            return true;
                          })
                          .slice(0, 8)
                      : [];

                  return (
                    <div key={p.id} className="card" style={{ overflow: "hidden", display: "flex", flexDirection: "column" }}>
                      <div
                        style={{
                          height: 160,
                          background: "rgba(255,255,255,.04)",
                          borderBottom: "1px solid var(--border)",
                          display: "flex",
                          alignItems: "center",
                          justifyContent: "center",
                        }}
                      >
                        {img ? (
                          <img
                            src={img}
                            alt={title}
                            style={{ width: "100%", height: "100%", objectFit: "cover" }}
                            onError={(e) => {
                              // Hide broken image & show fallback
                              const el = e.currentTarget;
                              el.style.display = "none";
                              const parent = el.parentElement;
                              if (parent) {
                                const fallback = document.createElement("div");
                                fallback.textContent = "No image";
                                fallback.style.color = "var(--muted)";
                                fallback.style.fontSize = "13px";
                                parent.appendChild(fallback);
                              }
                            }}
                          />
                        ) : (
                          <div style={{ color: "var(--muted)", fontSize: 13 }}>No image</div>
                        )}
                      </div>

                      <div style={{ padding: 14, display: "flex", flexDirection: "column", gap: 10, flex: 1 }}>
                        <div>
                          <div style={{ fontWeight: 900, fontSize: 16, lineHeight: 1.2 }}>{title}</div>
                          {desc ? (
                            <div style={{ color: "var(--muted)", fontSize: 13, marginTop: 6, lineHeight: 1.45 }}>
                              {desc.length > 140 ? desc.slice(0, 140) + "…" : desc}
                            </div>
                          ) : null}
                        </div>

                        {meta.length ? (
                          <div style={{ display: "grid", gap: 6 }}>
                            {meta.map(([k, v]) => (
                              <div key={k} style={{ display: "flex", justifyContent: "space-between", gap: 10, fontSize: 12, color: "var(--muted)" }}>
                                <span style={{ opacity: 0.9 }}>{k}</span>
                                <span style={{ color: "var(--text)", opacity: 0.9, textAlign: "right" }}>{toStr(v)}</span>
                              </div>
                            ))}
                          </div>
                        ) : (
                          <div style={{ color: "var(--muted)", fontSize: 12 }}>No extra fields</div>
                        )}

                        <div style={{ display: "flex", gap: 10, marginTop: "auto" }}>
                          {link ? (
                            <a className="btn btnPrimary" href={link} target="_blank" rel="noreferrer" style={{ width: "100%" }}>
                              Open
                            </a>
                          ) : (
                            <button className="btn" disabled style={{ width: "100%", opacity: 0.55, cursor: "not-allowed" }}>
                              No link
                            </button>
                          )}
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </main>
        </div>
      </div>
    </>
  );
}