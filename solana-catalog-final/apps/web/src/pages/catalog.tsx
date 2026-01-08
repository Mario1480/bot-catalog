import { useEffect, useMemo, useState } from "react";
import { AppHeader } from "../components/AppHeader";
import { apiFetch } from "../lib/api";

type Product = {
  id: string;

  // API fields
  title?: string;
  description?: string;
  image_url?: string;
  target_url?: string;
  status?: string;
  updated_at?: string;

  // Optional / future-proof fields
  name?: string;
  imageUrl?: string;
  linkUrl?: string;
  fields?: Record<string, any> | string;
  tags?: string[];
  category?: string;
  createdAt?: string;

  // ✅ allow unknown keys coming from API
  [key: string]: any;
};

type SortKey = "newest" | "az" | "za";

function normalizeText(v: any) {
  return (v ?? "").toString().toLowerCase().trim();
}

function getProductName(p: Product) {
  return (p.title || p.name || "Untitled").toString();
}

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

  // 1) fields als Objekt oder JSON-String
  let fieldsObj: Record<string, any> | null = null;

  if (p.fields && typeof p.fields === "object") {
    fieldsObj = p.fields as Record<string, any>;
  } else if (typeof p.fields === "string") {
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

  // 2) Alle unbekannten Keys aus dem API-Objekt anzeigen
  const known = new Set([
    "id",
    "title",
    "description",
    "image_url",
    "target_url",
    "status",
    "updated_at",
    "name",
    "imageUrl",
    "linkUrl",
    "fields",
    "tags",
    "category",
    "createdAt",
  ]);

  for (const [k, v] of Object.entries(p)) {
    if (known.has(k)) continue;
    if (v === null || v === undefined || `${v}`.trim() === "") continue;

    if (typeof v === "object") out.push([k, JSON.stringify(v)]);
    else out.push([k, v]);
  }

  // Deduplizieren
  const seen = new Set<string>();
  const deduped: Array<[string, any]> = [];
  for (const [k, v] of out) {
    if (seen.has(k)) continue;
    seen.add(k);
    deduped.push([k, v]);
  }

  return deduped.slice(0, 50);
}

function isAuthErrorMessage(msg: string) {
  const m = (msg || "").toLowerCase();
  return (
    m.includes("unauthorized") ||
    m.includes("invalid token") ||
    m.includes("jwt") ||
    m.includes("token expired") ||
    m.includes("forbidden") ||
    m.includes("status 401") ||
    m.includes("status 403")
  );
}

export default function CatalogPage() {
  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState("");

  const [q, setQ] = useState("");
  const [sort, setSort] = useState<SortKey>("newest");

  // pagination (client-side over filtered list)
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(24);

  const [selectedCategory, setSelectedCategory] = useState("All");
  const [selectedTag, setSelectedTag] = useState("All");

  // ✅ Modal state
  const [selectedProduct, setSelectedProduct] = useState<Product | null>(null);

  // responsive layout
  const [isMobile, setIsMobile] = useState(false);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const mq = window.matchMedia("(max-width: 860px)");
    const apply = () => setIsMobile(!!mq.matches);
    apply();

    // Safari compatibility
    if (typeof mq.addEventListener === "function") {
      mq.addEventListener("change", apply);
      return () => mq.removeEventListener("change", apply);
    }
    // @ts-ignore
    mq.addListener(apply);
    // @ts-ignore
    return () => mq.removeListener(apply);
  }, []);

  // Helper to fetch all products across paginated responses
  async function fetchAllProducts(jwt: string): Promise<Product[]> {
    const pageSize = 200;
    let page = 1;
    const all: Product[] = [];
    const seen = new Set<string>();

    while (page <= 200) {
      const qs = `?page=${page}&pageSize=${pageSize}`;
      const out: any = await apiFetch(`/products${qs}`, { method: "GET" }, jwt);

      // Support both array and object shapes
      const items: Product[] = Array.isArray(out)
        ? (out as Product[])
        : Array.isArray(out?.items)
          ? (out.items as Product[])
          : Array.isArray(out?.products)
            ? (out.products as Product[])
            : [];

      // If the backend ignores pagination and returns everything as an array once, we are done.
      if (Array.isArray(out) && page === 1) return items;

      if (!items.length) break;

      let addedThisPage = 0;
      for (const p of items) {
        const id = String((p as any)?.id ?? "");
        if (id && seen.has(id)) continue;
        if (id) seen.add(id);
        all.push(p);
        addedThisPage++;
      }

      // If we didn't add anything new, stop to avoid infinite loops
      if (addedThisPage === 0) break;

      const total = Number(out?.total ?? out?.count ?? NaN);
      if (Number.isFinite(total) && all.length >= total) break;

      page++;
    }

    return all;
  }

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

        const items = await fetchAllProducts(jwt);
        setProducts(items);
      } catch (e: any) {
        const msg = (e?.message || "Failed to load products").toString();
        setErr(msg);

        if (isAuthErrorMessage(msg)) {
          try {
            localStorage.removeItem("user_jwt");
          } catch {}
          window.location.href = "/";
          return;
        }
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  const categories = useMemo(() => {
    const set = new Set<string>();
    for (const p of products) {
      for (const c of getCategoriesFromProduct(p)) set.add(c);
    }
    return ["All", ...Array.from(set).sort((a, b) => a.localeCompare(b))];
  }, [products]);

  const tags = useMemo(() => {
    const set = new Set<string>();
    for (const p of products) {
      for (const t of getTagsFromProduct(p)) set.add(t);
    }
    return ["All", ...Array.from(set).sort((a, b) => a.localeCompare(b))];
  }, [products]);

  // Keep selected values valid when data changes
  useEffect(() => {
    if (selectedCategory !== "All" && !categories.includes(selectedCategory)) {
      setSelectedCategory("All");
    }
  }, [categories, selectedCategory]);

  useEffect(() => {
    if (selectedTag !== "All" && !tags.includes(selectedTag)) {
      setSelectedTag("All");
    }
  }, [tags, selectedTag]);

  const filtered = useMemo(() => {
    const qq = normalizeText(q);

    let list = products.filter((p) => {
      const title = normalizeText(getProductName(p));
      const desc = normalizeText(p.description);

      const cats = getCategoriesFromProduct(p).map(normalizeText);
      const ts = getTagsFromProduct(p).map(normalizeText);

      const matchQ = !qq || title.includes(qq) || desc.includes(qq);
      const matchCategory =
        selectedCategory === "All" || cats.includes(normalizeText(selectedCategory));
      const matchTag =
        selectedTag === "All" || ts.includes(normalizeText(selectedTag));

      return matchQ && matchCategory && matchTag;
    });

    if (sort === "az") {
      list = list.sort((a, b) => getProductName(a).localeCompare(getProductName(b)));
    } else if (sort === "za") {
      list = list.sort((a, b) => getProductName(b).localeCompare(getProductName(a)));
    } else {
      list = list.sort((a, b) => {
        const da = new Date(a.updated_at || a.createdAt || 0).getTime();
        const db = new Date(b.updated_at || b.createdAt || 0).getTime();
        return db - da;
      });
    }

    return list;
  }, [products, q, sort, selectedCategory, selectedTag]);

  // reset to page 1 when filter/sort/search changes
  useEffect(() => {
    setPage(1);
  }, [q, sort, selectedCategory, selectedTag]);

  const totalPages = useMemo(() => {
    return Math.max(1, Math.ceil(filtered.length / Math.max(1, pageSize)));
  }, [filtered.length, pageSize]);

  useEffect(() => {
    // clamp page if product list shrinks
    setPage((p) => Math.min(Math.max(1, p), totalPages));
  }, [totalPages]);

  const paged = useMemo(() => {
    const size = Math.max(1, pageSize);
    const p = Math.min(Math.max(1, page), totalPages);
    const start = (p - 1) * size;
    return filtered.slice(start, start + size);
  }, [filtered, page, pageSize, totalPages]);

  const rangeLabel = useMemo(() => {
    if (loading) return "Loading products…";
    if (filtered.length === 0) return "0 item(s)";
    const size = Math.max(1, pageSize);
    const p = Math.min(Math.max(1, page), totalPages);
    const start = (p - 1) * size + 1;
    const end = Math.min(filtered.length, p * size);
    return `${start}–${end} of ${filtered.length}`;
  }, [loading, filtered.length, page, pageSize, totalPages]);

  return (
    <>
      <AppHeader />

      <div className="container">
        <div className="card" style={{ padding: 16, marginBottom: 16 }}>
          <div style={{ display: "flex", gap: 12, alignItems: "center", justifyContent: "space-between", flexWrap: "wrap" }}>
            <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
              <div style={{ fontSize: 20, fontWeight: 900, letterSpacing: -0.3 }}>Catalog</div>
              <div style={{ color: "var(--muted)", fontSize: 13 }}>
                {rangeLabel}
              </div>
            </div>

            <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
              <select className="input" style={{ width: 180 }} value={sort} onChange={(e) => setSort(e.target.value as SortKey)}>
                <option value="newest">Sort: Newest</option>
                <option value="az">Sort: A → Z</option>
                <option value="za">Sort: Z → A</option>
              </select>
              <select
                className="input"
                style={{ width: 160 }}
                value={pageSize}
                onChange={(e) => setPageSize(Number(e.target.value))}
              >
                <option value={12}>12 / page</option>
                <option value={24}>24 / page</option>
                <option value={48}>48 / page</option>
                <option value={96}>96 / page</option>
              </select>
            </div>
          </div>
        </div>

        <div
          style={{
            display: "grid",
            gridTemplateColumns: isMobile ? "1fr" : "280px 1fr",
            gap: 16,
            alignItems: "start",
          }}
        >
          <aside
            className="card"
            style={{
              padding: 16,
              height: "fit-content",
              position: isMobile ? "static" : "sticky",
              top: isMobile ? undefined : 88,
              // On mobile, show filters ABOVE products
              order: isMobile ? -1 : 0,
            }}
          >
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
                <div style={{ fontSize: 12, color: "var(--muted)", marginBottom: 6 }}>Coins</div>
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

          <main style={{ order: 1 }}>
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
              <>
                <div style={{ marginBottom: 14 }}>
                  <PaginationBar
                    page={page}
                    totalPages={totalPages}
                    onPage={setPage}
                    disabled={loading || filtered.length === 0}
                  />
                </div>

                <div
                  style={{
                    display: "grid",
                    gridTemplateColumns: "repeat(auto-fill, minmax(260px, 1fr))",
                    gap: 14,
                  }}
                >
                  {paged.map((p) => {
                    const img = resolveImageSrc(p.image_url || p.imageUrl || "");
                    const link = resolveLink(p.target_url || p.linkUrl || "");
                    const title = getProductName(p);

                    return (
                      <div key={p.id} className="card" style={{ overflow: "hidden", display: "flex", flexDirection: "column" }}>
                        <div
                          style={{
                            aspectRatio: "1 / 1",
                            background: "rgba(255,255,255,.04)",
                            borderBottom: "1px solid var(--border)",
                            display: "flex",
                            alignItems: "center",
                            justifyContent: "center",
                            overflow: "hidden",
                          }}
                        >
                          {img ? (
                            <img src={img} alt={title} loading="lazy" decoding="async" style={{ width: "100%", height: "100%", objectFit: "cover" }} />
                          ) : (
                            <div style={{ color: "var(--muted)", fontSize: 13 }}>No image</div>
                          )}
                        </div>

                        <div style={{ padding: 14, display: "flex", flexDirection: "column", gap: 10, flex: 1 }}>
                          <div style={{ fontWeight: 900, fontSize: 16, lineHeight: 1.2 }}>{title}</div>

                          {/* ✅ Buttons: Details oben, Open bleibt */}
                          <div style={{ display: "grid", gap: 10, marginTop: "auto" }}>
                            <button className="btn" style={{ width: "100%" }} onClick={() => setSelectedProduct(p)}>
                              Details
                            </button>

                            {link ? (
                              <a className="btn btnPrimary" href={link} target="_blank" rel="noreferrer" style={{ width: "100%" }}>
                                Start Bot
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
                <div style={{ marginTop: 18 }}>
                  <PaginationBar
                    page={page}
                    totalPages={totalPages}
                    onPage={setPage}
                    disabled={loading || filtered.length === 0}
                  />
                </div>
              </>
            )}
          </main>
        </div>
      </div>

      {/* ✅ DETAILS MODAL (same page) */}
      {selectedProduct && (() => {
        const title = getProductName(selectedProduct);
        const img = resolveImageSrc(selectedProduct.image_url || selectedProduct.imageUrl || "");
        const link = resolveLink(selectedProduct.target_url || selectedProduct.linkUrl || "");
        const extra = buildExtraFields(selectedProduct);

        return (
          <div
            onClick={() => setSelectedProduct(null)}
            style={{
              position: "fixed",
              inset: 0,
              background: "rgba(0,0,0,.65)",
              zIndex: 60,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              padding: 12,
            }}
          >
            <div
              onClick={(e) => e.stopPropagation()}
              className="card"
              style={{
                width: "min(980px, 100%)",
                maxHeight: "90vh",
                overflow: "auto",
                padding: 16,
                margin: "0 auto",
              }}
            >
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12 }}>
                <div style={{ fontWeight: 900, fontSize: 18 }}>{title}</div>
                <button className="btn" onClick={() => setSelectedProduct(null)}>✕</button>
              </div>

              {img ? (
                <div style={{ marginTop: 14 }}>
                  <img
                    src={img}
                    alt={title}
                    loading="lazy"
                    decoding="async"
                    style={{
                      width: "100%",
                      maxWidth: 500,
                      maxHeight: 500,
                      aspectRatio: "1 / 1",
                      objectFit: "cover",
                      borderRadius: 12,
                      border: "1px solid var(--border)",
                      marginInline: "auto",
                      display: "block",
                    }}
                  />
                </div>
              ) : null}

              {selectedProduct.description ? (
                <div style={{ marginTop: 14, color: "var(--muted)", lineHeight: 1.6 }}>
                  {String(selectedProduct.description)}
                </div>
              ) : null}

              <div style={{ marginTop: 16 }}>
                <div style={{ fontWeight: 900, marginBottom: 10 }}>Details</div>

                {extra.length ? (
                  <div className="card" style={{ padding: 12 }}>
                    <div style={{ display: "grid", gap: 10 }}>
                      {extra.map(([k, v]) => (
                        <div key={k} style={{ display: "grid", gridTemplateColumns: "minmax(110px, 180px) 1fr", gap: 12, alignItems: "start" }}>
                          <div style={{ color: "var(--muted)", fontSize: 13 }}>{k}</div>
                          <div style={{ fontSize: 13, wordBreak: "break-word" }}>{String(v)}</div>
                        </div>
                      ))}
                    </div>
                  </div>
                ) : (
                  <div style={{ color: "var(--muted)", fontSize: 13 }}>No extra fields</div>
                )}
              </div>

              <div style={{ marginTop: 16, display: "flex", gap: 10, flexWrap: "wrap" }}>
                {link ? (
                  <a className="btn btnPrimary" href={link} target="_blank" rel="noreferrer">
                    Start Bot
                  </a>
                ) : (
                  <button className="btn" disabled style={{ opacity: 0.55 }}>
                    No link
                  </button>
                )}

                <button className="btn" onClick={() => setSelectedProduct(null)}>
                  Close
                </button>
              </div>
            </div>
          </div>
        );
      })()}
    </>
  );
}
// CATEGORY/TAG helpers for filters
function getCategoriesFromProduct(p: Product): string[] {
  // categories are stored as repeated product_fields rows with key "category".
  // API returns fields as object where duplicates become arrays.
  const fields: any = p.fields;
  const v = fields && typeof fields === "object" ? fields["category"] : undefined;

  if (Array.isArray(v)) return v.map((x) => String(x).trim()).filter(Boolean);
  if (typeof v === "string") {
    // allow "A|B" or "A,B" in legacy data
    const s = v.trim();
    if (!s) return [];
    if (s.includes("|") || s.includes(",")) {
      return s
        .split(/[|,]/g)
        .map((x) => x.trim())
        .filter(Boolean);
    }
    return [s];
  }
  return [];
}

function getTagsFromProduct(p: Product): string[] {
  const tags = Array.isArray(p.tags) ? p.tags : [];
  return tags.map((t) => String(t).trim()).filter(Boolean);
}

function PaginationBar(props: {
  page: number;
  totalPages: number;
  onPage: (p: number) => void;
  disabled?: boolean;
}) {
  const { page, totalPages, onPage, disabled } = props;

  const canPrev = !disabled && page > 1;
  const canNext = !disabled && page < totalPages;

  const jump = (p: number) => {
    const next = Math.min(Math.max(1, p), totalPages);
    onPage(next);
  };

  // show a compact window around current page
  const windowSize = 5;
  const start = Math.max(1, page - Math.floor(windowSize / 2));
  const end = Math.min(totalPages, start + windowSize - 1);
  const pages: number[] = [];
  for (let i = start; i <= end; i++) pages.push(i);

  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        gap: 12,
        flexWrap: "wrap",
      }}
    >
      <div style={{ color: "var(--muted)", fontSize: 13 }}>
        Page <b style={{ color: "var(--text)" }}>{page}</b> / {totalPages}
      </div>

      <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
        <button className="btn" disabled={!canPrev} onClick={() => jump(1)}>
          « First
        </button>
        <button className="btn" disabled={!canPrev} onClick={() => jump(page - 1)}>
          ‹ Prev
        </button>

        {pages.map((p) => (
          <button
            key={p}
            className={p === page ? "btn btnPrimary" : "btn"}
            onClick={() => jump(p)}
            disabled={disabled}
            style={{ paddingInline: 12 }}
          >
            {p}
          </button>
        ))}

        <button className="btn" disabled={!canNext} onClick={() => jump(page + 1)}>
          Next ›
        </button>
        <button className="btn" disabled={!canNext} onClick={() => jump(totalPages)}>
          Last »
        </button>
      </div>
    </div>
  );
}