import { useEffect, useMemo, useState } from "react";
import { AppHeader } from "../components/AppHeader";
import { WalletConnect } from "../components/WalletConnect";
import { apiFetch } from "../lib/api";

type Product = {
  id: string;
  name?: string;
  title?: string;
  description?: string;

  imageUrl?: string;
  linkUrl?: string;
  fields?: Record<string, any>;
  tags?: string[];
  category?: string;
  createdAt?: string;

  _raw?: any;
};

type SortKey = "newest" | "az" | "za";

function getProductName(p: Product) {
  return (p.name || p.title || "Untitled").toString();
}

function normalizeText(s: any) {
  return (s ?? "").toString().toLowerCase().trim();
}

function toStringSafe(v: any) {
  if (v === null || v === undefined) return "";
  return String(v).trim();
}

function parseMaybeJson(v: any) {
  if (!v) return null;
  if (typeof v === "object") return v;
  if (typeof v !== "string") return null;
  const s = v.trim();
  if (!s) return null;
  try {
    return JSON.parse(s);
  } catch {
    return null;
  }
}

function fieldsToRecord(v: any): Record<string, any> {
  if (!v) return {};
  if (typeof v === "object" && !Array.isArray(v)) return v as Record<string, any>;

  // JSON string?
  if (typeof v === "string") {
    const parsed = parseMaybeJson(v);
    if (parsed && typeof parsed === "object") return fieldsToRecord(parsed);
    return {};
  }

  // Array like [{key,value}] or [{name,value}]
  if (Array.isArray(v)) {
    const out: Record<string, any> = {};
    for (const item of v) {
      if (!item) continue;
      const k = toStringSafe(item.key ?? item.name ?? item.field ?? item.label);
      const val = item.value ?? item.val ?? item.data;
      if (k) out[k] = val;
    }
    return out;
  }

  return {};
}

function normalizeProduct(raw: any): Product {
  const id = String(raw?.id ?? raw?._id ?? "");

  const image =
    raw?.imageUrl ??
    raw?.image_url ??
    raw?.image ??
    raw?.imagePath ??
    raw?.image_path ??
    raw?.thumbnail ??
    raw?.thumb ??
    "";

  const link =
    raw?.linkUrl ??
    raw?.link_url ??
    raw?.link ??
    raw?.url ??
    raw?.website ??
    raw?.web ??
    "";

  const fields =
    raw?.fields ??
    raw?.extraFields ??
    raw?.extra_fields ??
    raw?.metadata ??
    raw?.meta ??
    raw?.attributes ??
    {};

  const createdAt =
    raw?.createdAt ??
    raw?.created_at ??
    raw?.created ??
    raw?.createdOn ??
    raw?.created_on ??
    undefined;

  const fieldsObj = fieldsToRecord(fields);

  const tagsRaw = raw?.tags;
  const tagsFromRaw = Array.isArray(tagsRaw)
    ? tagsRaw
    : typeof tagsRaw === "string"
      ? tagsRaw.split(",").map((x: string) => x.trim()).filter(Boolean)
      : [];

  const tagsFromFields = Array.isArray(fieldsObj?.tags)
    ? fieldsObj.tags
    : typeof fieldsObj?.tags === "string"
      ? String(fieldsObj.tags).split(",").map((x) => x.trim()).filter(Boolean)
      : [];

  const category =
    toStringSafe(raw?.category) ||
    toStringSafe(fieldsObj?.category) ||
    toStringSafe(raw?.cat) ||
    "";

  return {
    id,
    name: raw?.name ?? raw?.title ?? raw?.product_name ?? raw?.productTitle,
    title: raw?.title ?? raw?.name,
    description: raw?.description ?? raw?.desc ?? raw?.details ?? "",
    imageUrl: toStringSafe(image),
    linkUrl: toStringSafe(link),
    fields: fieldsObj,
    tags: [...tagsFromRaw, ...tagsFromFields].filter(Boolean).map((t) => String(t)),
    category,
    createdAt: createdAt ? String(createdAt) : undefined,
    _raw: raw,
  };
}

function getImageSrc(p: Product) {
  const u = toStringSafe(p.imageUrl);
  if (!u) return "";

  if (u.startsWith("http://") || u.startsWith("https://")) return u;
  if (u.startsWith("uploads/")) return `/${u}`; // "uploads/x" -> "/uploads/x"
  if (u.startsWith("/")) return u;

  return `/uploads/${u}`; // filename only
}

function getLink(p: Product) {
  const direct = toStringSafe(p.linkUrl);
  if (direct) return direct;

  const f = p.fields || {};
  const candidates = [f.linkUrl, f.link_url, f.link, f.url, f.website, f.web, f.checkout];

  for (const c of candidates) {
    const v = toStringSafe(c);
    if (v) return v;
  }
  return "";
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
      const c = toStringSafe(p.category || p.fields?.category);
      if (c) set.add(c);
    }
    return ["All", ...Array.from(set).sort((a, b) => a.localeCompare(b))];
  }, [products]);

  const tags = useMemo(() => {
    const set = new Set<string>();
    for (const p of products) {
      const t1: string[] = Array.isArray(p.tags) ? p.tags : [];
      const t2: string[] = Array.isArray(p.fields?.tags) ? p.fields.tags : [];
      for (const t of [...t1, ...t2]) {
        const tt = toStringSafe(t);
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
        toStringSafe(p.category || p.fields?.category) === selectedCategory;

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
                    <option key={c} value={c}>
                      {c}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <div style={{ fontSize: 12, color: "var(--muted)", marginBottom: 6 }}>Tag</div>
                <select className="input" value={selectedTag} onChange={(e) => setSelectedTag(e.target.value)}>
                  {tags.map((t) => (
                    <option key={t} value={t}>
                      {t}
                    </option>
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
              <div className="card" style={{ padding: 18 }}>
                Loading…
              </div>
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
                  const desc = toStringSafe(p.description);

                  const meta =
                    p.fields && typeof p.fields === "object"
                      ? Object.entries(p.fields)
                          .filter(([k, v]) => {
                            if (v === null || v === undefined) return false;
                            const sv = toStringSafe(v);
                            if (!sv) return false;

                            const kk = k.toLowerCase();
                            if (
                              [
                                "title",
                                "name",
                                "description",
                                "image",
                                "imageurl",
                                "image_url",
                                "link",
                                "linkurl",
                                "link_url",
                                "category",
                                "tags",
                                "url",
                                "website",
                                "web",
                              ].includes(kk)
                            ) {
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
                              const el = e.currentTarget as HTMLImageElement;
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
                                <span style={{ color: "var(--text)", opacity: 0.9, textAlign: "right" }}>{toStringSafe(v)}</span>
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