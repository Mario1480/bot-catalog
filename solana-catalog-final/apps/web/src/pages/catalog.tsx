import { useEffect, useMemo, useRef, useState } from "react";
import { AppHeader } from "../components/AppHeader";
import { AppFooter } from "../components/AppFooter";
import { apiFetch, apiBase } from "../lib/api";

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

  [key: string]: any;
};

type SortKey = "newest" | "az" | "za";

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

  const seen = new Set<string>();
  const deduped: Array<[string, any]> = [];
  for (const [k, v] of out) {
    if (seen.has(k)) continue;
    seen.add(k);
    deduped.push([k, v]);
  }

  return deduped.slice(0, 50);
}

function getLevels(p: Product): string[] {
  const raw = p.fields;
  let fieldsObj: Record<string, any> | null = null;
  if (raw && typeof raw === "object") fieldsObj = raw as Record<string, any>;
  else if (typeof raw === "string") {
    try {
      const parsed = JSON.parse(raw);
      if (parsed && typeof parsed === "object") fieldsObj = parsed;
    } catch {}
  }

  if (!fieldsObj) return [];
  const v = fieldsObj.level;
  if (Array.isArray(v)) return v.map((x) => String(x)).filter(Boolean);
  if (v) return [String(v)];
  return [];
}

function levelBadgeStyle(level: string): React.CSSProperties {
  const l = level.toLowerCase();
  if (l.includes("beginner")) {
    return { borderColor: "rgba(76, 255, 166, .5)", background: "rgba(76, 255, 166, .12)", color: "#b9f9d6" };
  }
  if (l.includes("advanced")) {
    return { borderColor: "rgba(255, 193, 7, .5)", background: "rgba(255, 193, 7, .12)", color: "#ffe29a" };
  }
  if (l.includes("expert")) {
    return { borderColor: "rgba(255, 80, 80, .5)", background: "rgba(255, 80, 80, .12)", color: "#ffb1b1" };
  }
  return {};
}

function getLevelBadgeSrc(level: string): string {
  const l = level.toLowerCase();
  if (l.includes("beginner")) return "/level-badges/beginner.png";
  if (l.includes("advanced")) return "/level-badges/advanced.png";
  if (l.includes("expert")) return "/level-badges/expert.png";
  return "";
}

function normalizeDescriptionHtml(input: string) {
  return (input || "").replace(
    /color\s*:\s*(#000000|#000|rgb\s*\(\s*0\s*,\s*0\s*,\s*0\s*\)|black)\s*;?/gi,
    "color: inherit;"
  );
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

function notifyJwtChanged() {
  try {
    window.dispatchEvent(new Event("user_jwt_changed"));
  } catch {}
}

export default function CatalogPage() {
  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState("");
  const [favoriteIds, setFavoriteIds] = useState<string[]>([]);

  const [q, setQ] = useState("");
  const [sort, setSort] = useState<SortKey>("newest");
  const [onlyFavorites, setOnlyFavorites] = useState(false);

  const [selectedCategory, setSelectedCategory] = useState("All");
  const [selectedTag, setSelectedTag] = useState("All");
  const [selectedLevel, setSelectedLevel] = useState("All");
  const [categories, setCategories] = useState<string[]>(["All"]);
  const [tags, setTags] = useState<string[]>(["All"]);

  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(12);
  const [hasNextPage, setHasNextPage] = useState(false);

  const [selectedProduct, setSelectedProduct] = useState<Product | null>(null);

  // --- auth token state (reacts live to connect/disconnect)
  const [jwt, setJwt] = useState<string>(() => {
    if (typeof window === "undefined") return "";
    return localStorage.getItem("user_jwt") || "";
  });

  const [needsAuth, setNeedsAuth] = useState<boolean>(() => !jwt);

  const lastJwtRef = useRef<string>(jwt || "");
  const API = apiBase();

  const favoriteSet = useMemo(() => new Set(favoriteIds), [favoriteIds]);

  // Listen for token changes (WalletConnect dispatches user_jwt_changed)
  // plus a lightweight poll as a safety net (some wallet UIs may not dispatch our custom event).
  useEffect(() => {
    const readJwt = () => {
      try {
        return localStorage.getItem("user_jwt") || "";
      } catch {
        return "";
      }
    };

    const sync = () => {
      const t = readJwt();
      lastJwtRef.current = t;
      setJwt(t);

      if (!t) {
        // immediately hide content on disconnect
        setNeedsAuth(true);
        setProducts([]);
        setSelectedProduct(null);
        setErr("");
        setLoading(false);
      } else {
        setNeedsAuth(false);
      }
    };

    const onVisibility = () => {
      if (document.visibilityState === "visible") sync();
    };

    // initial sync
    sync();

    // primary signal (our custom event)
    window.addEventListener("user_jwt_changed", sync);

    // extra safety nets
    window.addEventListener("focus", sync);
    document.addEventListener("visibilitychange", onVisibility);

    // polling safety net (kept small + cheap)
    const iv = window.setInterval(() => {
      const t = readJwt();
      if (t !== lastJwtRef.current) sync();
    }, 500);

    return () => {
      window.removeEventListener("user_jwt_changed", sync);
      window.removeEventListener("focus", sync);
      document.removeEventListener("visibilitychange", onVisibility);
      window.clearInterval(iv);
    };
  }, []);

  // Load filters once when authenticated
  useEffect(() => {
    if (!jwt) return;

    let cancelled = false;

    (async () => {
      try {
        const out = await apiFetch("/products/filters", { method: "GET" }, jwt);
        if (cancelled) return;
        const cats = Array.isArray(out?.categories) ? out.categories : [];
        const tgs = Array.isArray(out?.tags) ? out.tags : [];
        setCategories(["All", ...cats]);
        setTags(["All", ...tgs]);
      } catch {
        if (cancelled) return;
        setCategories(["All"]);
        setTags(["All"]);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [jwt]);

  useEffect(() => {
    if (!jwt) return;

    let cancelled = false;

    (async () => {
      try {
        const out = await apiFetch("/products/favorites", { method: "GET" }, jwt);
        if (cancelled) return;
        setFavoriteIds(Array.isArray(out) ? out : []);
      } catch {
        if (cancelled) return;
        setFavoriteIds([]);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [jwt]);

  // Reset pagination on search/filter change
  useEffect(() => {
    setPage(1);
  }, [q, selectedCategory, selectedTag, selectedLevel, pageSize, onlyFavorites]);

  // Load products whenever jwt or query params change
  useEffect(() => {
    if (!jwt) return;

    let cancelled = false;

    (async () => {
      try {
        setLoading(true);
        setErr("");

        const params = new URLSearchParams();
        if (q) params.set("search", q);
        if (selectedCategory !== "All") params.set("filters[category]", selectedCategory);
        if (selectedTag !== "All") params.set("filters[tag]", selectedTag);
        if (selectedLevel !== "All") params.set("filters[level]", selectedLevel);
        if (onlyFavorites) params.set("onlyFavorites", "1");
        params.set("page", String(page));
        params.set("pageSize", String(pageSize));

        const out = await apiFetch(`/products?${params.toString()}`, { method: "GET" }, jwt);
        const items = Array.isArray(out) ? out : out?.items || out?.products || [];
        if (cancelled) return;
        setProducts(items);
        setHasNextPage(items.length === pageSize);
      } catch (e: any) {
        const msg = (e?.message || "Failed to load products").toString();
        if (cancelled) return;
        setErr(msg);
        setProducts([]);
        setHasNextPage(false);

        if (isAuthErrorMessage(msg)) {
          try {
            localStorage.removeItem("user_jwt");
            localStorage.removeItem("user_pubkey");
          } catch {}
          notifyJwtChanged(); // triggers sync() above to clear UI immediately
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [jwt, q, selectedCategory, selectedTag, selectedLevel, page, pageSize, onlyFavorites]);

  const filtered = useMemo(() => {
    let list = products.slice();

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
  }, [products, sort]);

  async function toggleFavorite(productId: string) {
    if (!jwt) return;

    const isFav = favoriteSet.has(productId);
    try {
      if (isFav) {
        await apiFetch(`/products/${productId}/favorite`, { method: "DELETE" }, jwt);
        setFavoriteIds((prev) => prev.filter((id) => id !== productId));
      } else {
        await apiFetch(`/products/${productId}/favorite`, { method: "POST" }, jwt);
        setFavoriteIds((prev) => (prev.includes(productId) ? prev : [productId, ...prev]));
      }
    } catch (e: any) {
      setErr((e?.message || "Failed to update favorite").toString());
    }
  }

  function recordProductClick(productId: string) {
    if (!jwt) return;
    fetch(`${API}/products/${productId}/click`, {
      method: "POST",
      headers: { Authorization: `Bearer ${jwt}` },
      keepalive: true,
    }).catch(() => {});
  }

  return (
    <>
      <AppHeader />

      <div className="container">
        {/* If not authenticated, show a friendly notice and no products */}
        {needsAuth ? (
          <div className="card" style={{ padding: 16, marginTop: 16 }}>
            <div style={{ fontSize: 18, fontWeight: 900 }}>Please connect your wallet</div>
            <div style={{ color: "var(--muted)", marginTop: 8, lineHeight: 1.5 }}>
              To access the catalog you need to connect your wallet and sign the login message.
            </div>
          </div>
        ) : null}

        {!needsAuth ? (
          <>
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
                  {loading ? "Loading products…" : `${filtered.length} item(s) on this page`}
                </div>
              </div>

                <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
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

                  <select
                    className="input"
                    style={{ width: 160 }}
                    value={pageSize}
                    onChange={(e) => setPageSize(Number(e.target.value))}
                  >
                    <option value={12}>Show: 12/page</option>
                    <option value={24}>Show: 24/page</option>
                    <option value={48}>Show: 48/page</option>
                  </select>

                  <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                    <button className="btn" disabled={page <= 1} onClick={() => setPage((p) => Math.max(1, p - 1))}>
                      Prev
                    </button>
                    <div style={{ fontSize: 12, color: "var(--muted)" }}>Page {page}</div>
                    <button className="btn" disabled={!hasNextPage} onClick={() => setPage((p) => p + 1)}>
                      Next
                    </button>
                  </div>
                </div>
              </div>
            </div>

            <div className="catalogGrid">
              <aside className="card catalogSidebar" style={{ padding: 16 }}>
                <div style={{ fontWeight: 900, marginBottom: 10 }}>Search</div>
                <input
                  className="input"
                  placeholder="Search products…"
                  value={q}
                  onChange={(e) => setQ(e.target.value)}
                />

                <div style={{ height: 14 }} />

                <div style={{ fontWeight: 900, marginBottom: 10 }}>Filters</div>

                <div style={{ display: "grid", gap: 10 }}>
                  <div>
                    <div style={{ fontSize: 12, color: "var(--muted)", marginBottom: 6 }}>Category</div>
                    <select
                      className="input"
                      value={selectedCategory}
                      onChange={(e) => setSelectedCategory(e.target.value)}
                    >
                      {categories.map((c) => (
                        <option key={c} value={c}>
                          {c}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div>
                    <div style={{ fontSize: 12, color: "var(--muted)", marginBottom: 6 }}>Coins</div>
                    <select className="input" value={selectedTag} onChange={(e) => setSelectedTag(e.target.value)}>
                      {tags.map((t) => (
                        <option key={t} value={t}>
                          {t}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div>
                    <div style={{ fontSize: 12, color: "var(--muted)", marginBottom: 6 }}>Level</div>
                    <select className="input" value={selectedLevel} onChange={(e) => setSelectedLevel(e.target.value)}>
                      {["All", "Beginner", "Advanced", "Expert"].map((lvl) => (
                        <option key={lvl} value={lvl}>
                          {lvl}
                        </option>
                      ))}
                    </select>
                  </div>

                  <label style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 13 }}>
                    <input
                      type="checkbox"
                      checked={onlyFavorites}
                      onChange={(e) => setOnlyFavorites(e.target.checked)}
                    />
                    Only favorites
                  </label>

                  <button
                    className="btn"
                    onClick={() => {
                      setQ("");
                      setSelectedCategory("All");
                      setSelectedTag("All");
                      setSelectedLevel("All");
                      setSort("newest");
                      setOnlyFavorites(false);
                      setPage(1);
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
                      const img = resolveImageSrc(p.image_url || p.imageUrl || "");
                      const link = resolveLink(p.target_url || p.linkUrl || "");
                      const title = getProductName(p);
                      const levels = getLevels(p);

                      return (
                        <div
                          key={p.id}
                          className="card"
                          style={{ overflow: "hidden", display: "flex", flexDirection: "column" }}
                        >
                          {/* square image */}
                          <div
                            style={{
                              aspectRatio: "1 / 1",
                              background: "rgba(255,255,255,.04)",
                              borderBottom: "1px solid var(--border)",
                              display: "flex",
                              alignItems: "center",
                              justifyContent: "center",
                              position: "relative",
                            }}
                          >
                            {levels.length ? (
                              <div
                                style={{
                                  position: "absolute",
                                  top: 8,
                                  right: 8,
                                  display: "flex",
                                  flexDirection: "column",
                                  gap: 6,
                                  zIndex: 2,
                                }}
                              >
                                {levels.map((lvl) => {
                                  const src = getLevelBadgeSrc(lvl);
                                  return src ? (
                                    <img
                                      key={lvl}
                                      src={src}
                                      alt={lvl}
                                      title={lvl}
                                      style={{ width: 64, height: 64, borderRadius: 12 }}
                                    />
                                  ) : (
                                    <span key={lvl} className="badge" style={levelBadgeStyle(lvl)}>
                                      {lvl}
                                    </span>
                                  );
                                })}
                              </div>
                            ) : null}
                            {img ? (
                              <img
                                src={img}
                                alt={title}
                                style={{ width: "100%", height: "100%", objectFit: "cover" }}
                              />
                            ) : (
                              <div style={{ color: "var(--muted)", fontSize: 13 }}>No image</div>
                            )}
                          </div>

                          <div style={{ padding: 14, display: "flex", flexDirection: "column", gap: 10, flex: 1 }}>
                            <div style={{ fontWeight: 900, fontSize: 16, lineHeight: 1.2 }}>{title}</div>
                            {levels.length ? (
                              <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                                {levels.map((lvl) => (
                                  <span key={lvl} className="badge" style={levelBadgeStyle(lvl)}>
                                    {lvl}
                                  </span>
                                ))}
                              </div>
                            ) : null}

                            <div style={{ display: "grid", gap: 10, marginTop: "auto" }}>
                              <button
                                className="btn"
                                style={{ width: "100%" }}
                                onClick={() => toggleFavorite(p.id)}
                              >
                                {favoriteSet.has(p.id) ? (
                                  <span style={{ color: "#FFC107" }}>★ Favorited</span>
                                ) : (
                                  "☆ Favorite"
                                )}
                              </button>

                              <button className="btn" style={{ width: "100%" }} onClick={() => setSelectedProduct(p)}>
                                Details
                              </button>

                              {link ? (
                                <a
                                  className="btn btnPrimary"
                                  href={link}
                                  target="_blank"
                                  rel="noreferrer"
                                  onClick={() => recordProductClick(p.id)}
                                  style={{ width: "100%" }}
                                >
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
                )}

                {!loading && filtered.length > 0 ? (
                  <div style={{ marginTop: 16, display: "flex", justifyContent: "center" }}>
                    <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
                      <button className="btn" disabled={page <= 1} onClick={() => setPage((p) => Math.max(1, p - 1))}>
                        Prev
                      </button>
                      <div style={{ fontSize: 12, color: "var(--muted)" }}>Page {page}</div>
                      <button className="btn" disabled={!hasNextPage} onClick={() => setPage((p) => p + 1)}>
                        Next
                      </button>
                    </div>
                  </div>
                ) : null}
              </main>
            </div>

            {/* DETAILS MODAL */}
            {selectedProduct && (() => {
              const title = getProductName(selectedProduct);
              const img = resolveImageSrc(selectedProduct.image_url || selectedProduct.imageUrl || "");
              const link = resolveLink(selectedProduct.target_url || selectedProduct.linkUrl || "");
              const extra = buildExtraFields(selectedProduct);
              const levels = getLevels(selectedProduct);

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
                    padding: 16,
                  }}
                >
                  <div
                    onClick={(e) => e.stopPropagation()}
                    className="card"
                    style={{
                      width: "min(980px, 100%)",
                      maxHeight: "90vh",
                      overflow: "auto",
                      padding: 18,
                    }}
                  >
                    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12 }}>
                      <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                        <div style={{ fontWeight: 900, fontSize: 18 }}>{title}</div>
                        {levels.length ? (
                          <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                            {levels.map((lvl) => (
                              <span key={lvl} className="badge" style={levelBadgeStyle(lvl)}>
                                {lvl}
                              </span>
                            ))}
                          </div>
                        ) : null}
                      </div>
                      <button className="btn" onClick={() => setSelectedProduct(null)}>✕</button>
                    </div>

                    {img ? (
                      <div style={{ marginTop: 14, display: "flex", justifyContent: "center" }}>
                        <div style={{ position: "relative", width: "100%", maxWidth: 500 }}>
                          {levels.length ? (
                            <div
                              style={{
                                position: "absolute",
                                top: 8,
                                right: 8,
                                display: "flex",
                                flexDirection: "column",
                                gap: 6,
                                zIndex: 2,
                              }}
                            >
                              {levels.map((lvl) => {
                                const src = getLevelBadgeSrc(lvl);
                                  return src ? (
                                    <img
                                      key={lvl}
                                      src={src}
                                      alt={lvl}
                                      title={lvl}
                                      style={{ width: 64, height: 64, borderRadius: 12 }}
                                    />
                                  ) : (
                                    <span key={lvl} className="badge" style={levelBadgeStyle(lvl)}>
                                      {lvl}
                                    </span>
                                );
                              })}
                            </div>
                          ) : null}
                          <img
                            src={img}
                            alt={title}
                            style={{
                              width: "100%",
                              aspectRatio: "1 / 1",
                              objectFit: "cover",
                              borderRadius: 12,
                              border: "1px solid var(--border)",
                            }}
                          />
                        </div>
                      </div>
                    ) : null}

                    {selectedProduct.description ? (
                      <div
                        style={{ marginTop: 14, color: "var(--muted)", lineHeight: 1.6 }}
                        dangerouslySetInnerHTML={{
                          __html: normalizeDescriptionHtml(String(selectedProduct.description)),
                        }}
                      />
                    ) : null}

                    <div style={{ marginTop: 16 }}>
                      <div style={{ fontWeight: 900, marginBottom: 10 }}>Details</div>

                      {extra.length ? (
                        <div className="card" style={{ padding: 12 }}>
                          <div style={{ display: "grid", gap: 10 }}>
                            {extra.map(([k, v]) => (
                              <div
                                key={k}
                                style={{
                                  display: "grid",
                                  gridTemplateColumns: "180px 1fr",
                                  gap: 12,
                                  alignItems: "start",
                                }}
                              >
                                <div style={{ color: "var(--muted)", fontSize: 13 }}>{k}</div>
                                <div style={{ fontSize: 13, wordBreak: "break-word" }}>{String(v)}</div>
                              </div>
                            ))}
                          </div>
                        </div>
                      ) : (
                        <div style={{ color: "var(--muted)", fontSize: 13 }}>No extra details</div>
                      )}
                    </div>

                    <div style={{ marginTop: 16, display: "flex", gap: 10, flexWrap: "wrap" }}>
                      <button className="btn" onClick={() => toggleFavorite(selectedProduct.id)}>
                        {favoriteSet.has(selectedProduct.id) ? (
                          <span style={{ color: "#FFC107" }}>★ Favorited</span>
                        ) : (
                          "☆ Favorite"
                        )}
                      </button>

                      {link ? (
                        <a
                          className="btn btnPrimary"
                          href={link}
                          target="_blank"
                          rel="noreferrer"
                          onClick={() => recordProductClick(selectedProduct.id)}
                        >
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
        ) : null}
      </div>

      <AppFooter />
    </>
  );
}
