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
  // Flexible product metadata fields (key/value).
  fields?: Record<string, any>;
  // Optional tags/categories for filtering.
  tags?: string[];
  category?: string;
  createdAt?: string;
};

type SortKey = "newest" | "az" | "za";

function getProductName(p: Product) {
  return (p.name || p.title || "Untitled").toString();
}

function normalizeText(s: any) {
  return (s ?? "").toString().toLowerCase().trim();
}

function getImageSrc(p: Product) {
  const u = (p.imageUrl || "").toString().trim();
  if (!u) return "";
  // Support absolute URLs and relative /uploads paths.
  if (u.startsWith("http://") || u.startsWith("https://")) return u;
  if (u.startsWith("/")) return u; // e.g. /uploads/xxx
  return `/uploads/${u}`; // e.g. "xxx.jpg"
}

function getLink(p: Product) {
  return (p.linkUrl || "").toString().trim();
}

function safeJson(v: any): Record<string, any> {
  if (!v) return {};
  if (typeof v === "object") return v as Record<string, any>;
  if (typeof v === "string") {
    try {
      const out = JSON.parse(v);
      return typeof out === "object" && out ? out : {};
    } catch {
      return {};
    }
  }
  return {};
}

function normalizeProduct(raw: any): Product {
  // Accept both snake_case and camelCase keys.
  const image =
    raw.imageUrl ??
    raw.image_url ??
    raw.image ??
    raw.imagePath ??
    raw.image_path ??
    "";

  const link =
    raw.linkUrl ??
    raw.link_url ??
    raw.link ??
    raw.url ??
    raw.website ??
    "";

  const fields =
    raw.fields ??
    raw.extraFields ??
    raw.extra_fields ??
    safeJson(raw.extra_fields) ??
    safeJson(raw.fields) ??
    {};

  const createdAt =
    raw.createdAt ??
    raw.created_at ??
    raw.created ??
    raw.createdOn ??
    raw.created_on ??
    undefined;

  const tagsFromRaw: any[] = Array.isArray(raw.tags) ? raw.tags : [];
  const tagsFromFields: any[] = Array.isArray(fields?.tags) ? fields.tags : [];

  return {
    ...raw,
    id: String(raw.id),
    name: raw.name ?? raw.title ?? raw.product_name ?? raw.productTitle,
    title: raw.title ?? raw.name,
    description: raw.description ?? raw.desc ?? raw.details ?? "",
    imageUrl: (image || "").toString(),
    linkUrl: (link || "").toString(),
    fields,
    tags: [...tagsFromRaw, ...tagsFromFields].filter(Boolean).map((t) => String(t)),
    category: (raw.category ?? fields?.category ?? "").toString(),
    createdAt: createdAt ? String(createdAt) : undefined,
  };
}

export default function CatalogPage() {
  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState("");

  const [q, setQ] = useState("");
  const [sort, setSort] = useState<SortKey>("newest");

  // Sidebar filter state.
  const [selectedCategory, setSelectedCategory] = useState<string>("All");
  const [selectedTag, setSelectedTag] = useState<string>("All");

  useEffect(() => {
    // Require JWT, otherwise redirect home.
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

        // Accept both {items: []} and [] as response.
        const items = Array.isArray(out) ? out : out?.items || out?.products || [];
        setProducts((items || []).map(normalizeProduct));
      } catch (e: any) {
        setErr(e?.message || "Failed to load products");
        // If unauthorized, send back to home.
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
      const c = (p.category || p.fields?.category || "").toString().trim();
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
        const tt = (t || "").toString().trim();
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
        (p.category || p.fields?.category || "").toString() === selectedCategory;

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
      // newest
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
        {/* Top bar */}
        <div className="card" style={{ padding: 16, marginBottom: 16 }}>
          <div
            style={{
              display: "flex",
              gap: 12,
              alignItems: "center",
              justifyContent: "space-between",
              flexWrap: "wrap",
            }}
          >
            <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
              <div style={{ fontSize: 20, fontWeight: 900, letterSpacing: -0.3 }}>Catalog</div>
              <div style={{ color: "var(--muted)", fontSize: 13 }}>
                {loading ? "Loading products…" : `${filtered.length} item(s)`}
              </div>
            </div>

            <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
              <WalletConnect />

              <select
                className="input"
                style={{ width: 180 }}
                value={sort}
                onChange={(e) => setSort(e.target.value as SortKey)}
              >
                <option value="newest">Sort: Newest</option>
                <option value="az">Sort: A → Z</option>
                <option value="za">Sort: Z → A</option>
              </select>
            </div>
          </div>
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "280px 1fr", gap: 16 }}>
          {/* Sidebar */}
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

          {/* Main grid */}
          <main>
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
                  const desc = (p.description || "").toString();

                  // Only show real “extra” fields; avoid duplicating common keys.
                  const meta =
                    p.fields && typeof p.fields === "object"
                      ? Object.entries(p.fields)
                          .filter(([k, v]) => {
                            if (v === null || v === undefined) return false;
                            const sv = `${v}`.trim();
                            if (!sv) return false;
                            const kk = k.toLowerCase();
                            // Filter out common keys that are already shown elsewhere
                            if (["title", "name", "description", "image", "imageurl", "image_url", "link", "linkurl", "link_url", "category", "tags"].includes(kk))
                              return false;
                            return true;
                          })
                          .slice(0, 6)
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
                          <img src={img} alt={title} style={{ width: "100%", height: "100%", objectFit: "cover" }} />
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
                              <div
                                key={k}
                                style={{
                                  display: "flex",
                                  justifyContent: "space-between",
                                  gap: 10,
                                  fontSize: 12,
                                  color: "var(--muted)",
                                }}
                              >
                                <span style={{ opacity: 0.9 }}>{k}</span>
                                <span style={{ color: "var(--text)", opacity: 0.9, textAlign: "right" }}>{String(v)}</span>
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