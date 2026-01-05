import { useEffect, useMemo, useState } from "react";
import { AppHeader } from "../components/AppHeader";
import { WalletConnect } from "../components/WalletConnect";
import { apiFetch } from "../lib/api";

type AnyObj = Record<string, any>;

type Product = {
  id: string;

  name?: string;
  title?: string;

  description?: string;
  desc?: string;

  imageUrl?: string;
  image_url?: string;
  image?: string;
  imagePath?: string;
  image_path?: string;
  upload?: string;
  file?: string;
  filename?: string;

  linkUrl?: string;
  link_url?: string;
  link?: string;
  url?: string;
  href?: string;
  website?: string;
  buttonUrl?: string;

  fields?: any;
  extraFields?: any;
  metadata?: any;

  tags?: string[];
  category?: string;

  createdAt?: string;
  created_at?: string;
};

type SortKey = "newest" | "az" | "za";

function normalizeText(v: any) {
  return (v ?? "").toString().toLowerCase().trim();
}

function getProductName(p: Product) {
  return (p.name || p.title || "Untitled").toString();
}

function pickFirstString(...vals: any[]) {
  for (const v of vals) {
    if (typeof v === "string" && v.trim()) return v.trim();
  }
  return "";
}

// English comment: Support fields coming as object, JSON string, or array of {key,value}.
function coerceFields(x: any): AnyObj {
  if (!x) return {};

  // If it's already an object (but not array)
  if (typeof x === "object" && !Array.isArray(x)) return x as AnyObj;

  // JSON string
  if (typeof x === "string") {
    try {
      const parsed = JSON.parse(x);
      return coerceFields(parsed);
    } catch {
      return {};
    }
  }

  // Array of {key,value} or {k,v}
  if (Array.isArray(x)) {
    const out: AnyObj = {};
    for (const item of x) {
      if (!item) continue;
      const k = item.key ?? item.k ?? item.name;
      const v = item.value ?? item.v ?? item.val;
      if (k !== undefined && k !== null) out[String(k)] = v;
    }
    return out;
  }

  return {};
}

function getFields(p: Product): AnyObj {
  const a = coerceFields((p as any).fields);
  const b = coerceFields((p as any).extraFields);
  const c = coerceFields((p as any).metadata);

  // Merge order: fields -> extraFields -> metadata (last wins)
  return { ...a, ...b, ...c };
}

function ensureUploadsPath(raw: string) {
  const u = (raw || "").trim();
  if (!u) return "";
  if (u.startsWith("http://") || u.startsWith("https://")) return u;
  if (u.startsWith("/uploads/")) return u;
  if (u.startsWith("/")) return u;
  return `/uploads/${u}`;
}

function ensureLink(raw: string) {
  const u = (raw || "").trim();
  if (!u) return "";
  if (u.startsWith("http://") || u.startsWith("https://")) return u;
  if (u.startsWith("www.")) return `https://${u}`;
  if (u.startsWith("/")) return u;
  return `https://${u}`;
}

function getDescription(p: Product) {
  return (p.description || p.desc || "").toString();
}

function getCategory(p: Product) {
  const f = getFields(p);
  return (p.category ?? f.category ?? f.Category ?? "").toString().trim();
}

function getTags(p: Product): string[] {
  const f = getFields(p);
  const t1 = Array.isArray(p.tags) ? p.tags : [];
  const t2 = Array.isArray(f.tags) ? f.tags : [];
  const t3 = typeof f.tags === "string" ? f.tags.split(",") : [];
  return [...t1, ...t2, ...t3]
    .map((x) => (x ?? "").toString().trim())
    .filter(Boolean);
}

function getImageSrc(p: Product) {
  const f = getFields(p);

  // Try top-level first, then fields
  const raw = pickFirstString(
    p.imageUrl, p.image_url, p.image, p.imagePath, p.image_path, p.upload, p.file, p.filename,
    f.imageUrl, f.image_url, f.image, f.imagePath, f.image_path, f.upload, f.file, f.filename,
    f.photo, f.picture
  );

  return ensureUploadsPath(raw);
}

function getLinkUrl(p: Product) {
  const f = getFields(p);

  const raw = pickFirstString(
    p.linkUrl, p.link_url, p.link, p.url, p.href, p.website, p.buttonUrl,
    f.linkUrl, f.link_url, f.link, f.url, f.href, f.website, f.buttonUrl,
    f.shop, f.buy, f.target
  );

  return ensureLink(raw);
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

        const out = await apiFetch("/products", { method: "GET" }, jwt);

        const items = Array.isArray(out) ? out : (out?.items || out?.products || []);
        setProducts(items);
      } catch (e: any) {
        const msg = e?.message || "Failed to load products";
        setErr(msg);

        if (msg.toLowerCase().includes("unauthorized")) {
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
      const c = getCategory(p);
      if (c) set.add(c);
    }
    return ["All", ...Array.from(set).sort((a, b) => a.localeCompare(b))];
  }, [products]);

  const tags = useMemo(() => {
    const set = new Set<string>();
    for (const p of products) {
      for (const t of getTags(p)) set.add(t);
    }
    return ["All", ...Array.from(set).sort((a, b) => a.localeCompare(b))];
  }, [products]);

  const filtered = useMemo(() => {
    const qq = normalizeText(q);

    let list = products.filter((p) => {
      const title = normalizeText(getProductName(p));
      const desc = normalizeText(getDescription(p));
      const cat = normalizeText(getCategory(p));
      const t = getTags(p).map(normalizeText);

      const matchQ =
        !qq ||
        title.includes(qq) ||
        desc.includes(qq) ||
        cat.includes(qq) ||
        t.some((x) => x.includes(qq));

      const matchCategory = selectedCategory === "All" || getCategory(p) === selectedCategory;
      const matchTag = selectedTag === "All" || getTags(p).includes(selectedTag);

      return matchQ && matchCategory && matchTag;
    });

    if (sort === "az") list = list.sort((a, b) => getProductName(a).localeCompare(getProductName(b)));
    if (sort === "za") list = list.sort((a, b) => getProductName(b).localeCompare(getProductName(a)));
    if (sort === "newest") {
      list = list.sort((a, b) => {
        const da = new Date((a.createdAt || a.created_at || 0) as any).getTime();
        const db = new Date((b.createdAt || b.created_at || 0) as any).getTime();
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

              <button className="btn" onClick={() => { setQ(""); setSelectedCategory("All"); setSelectedTag("All"); setSort("newest"); }}>
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
                  const link = getLinkUrl(p);
                  const title = getProductName(p);
                  const desc = getDescription(p);

                  const fields = getFields(p);

                  const hiddenKeys = new Set([
                    "id","name","title","description","desc",
                    "image","imageUrl","image_url","imagePath","image_path","upload","file","filename","photo","picture",
                    "link","linkUrl","link_url","url","href","website","buttonUrl","shop","buy","target",
                    "tags","category","createdAt","created_at"
                  ]);

                  const meta = Object.entries(fields)
                    .filter(([k, v]) => !hiddenKeys.has(k))
                    .filter(([_, v]) => v !== null && v !== undefined && `${v}`.trim() !== "")
                    .slice(0, 10);

                  return (
                    <div key={p.id} className="card" style={{ overflow: "hidden", display: "flex", flexDirection: "column" }}>
                      <div style={{ height: 160, background: "rgba(255,255,255,.04)", borderBottom: "1px solid var(--border)", display: "flex", alignItems: "center", justifyContent: "center" }}>
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
                              <div key={k} style={{ display: "flex", justifyContent: "space-between", gap: 10, fontSize: 12, color: "var(--muted)" }}>
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