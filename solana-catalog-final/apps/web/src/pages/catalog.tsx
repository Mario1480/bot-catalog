import { useEffect, useMemo, useState } from "react";
import { AppHeader } from "../components/AppHeader";
import { apiFetch } from "../lib/api";
import Link from "next/link";

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
  fields?: Record<string, any>;
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
    fieldsObj = p.fields;
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

  return deduped.slice(0, 50); // im Modal ruhig mehr zeigen
}

// ✅ Central helper: treat token problems consistently
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

  const [selectedCategory, setSelectedCategory] = useState("All");
  const [selectedTag, setSelectedTag] = useState("All");

  // ✅ Modal state
  const [selectedProduct, setSelectedProduct] = useState<Product | null>(null);

  useEffect(() => {
    const jwt =
      typeof window !== "undefined" ? localStorage.getItem("user_jwt") : null;

    if (!jwt) {
      window.location.href = "/";
      return;
    }

    (async () => {
      try {
        setLoading(true);
        setErr("");

        const out = await apiFetch("/products", { method: "GET" }, jwt);
        const items = Array.isArray(out) ? out : out?.items || out?.products || [];
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
    return ["All"];
  }, []);

  const tags = useMemo(() => {
    return ["All"];
  }, []);

  const filtered = useMemo(() => {
    const qq = normalizeText(q);

    let list = products.filter((p) => {
      const title = normalizeText(getProductName(p));
      const desc = normalizeText(p.description);

      const matchQ = !qq || title.includes(qq) || desc.includes(qq);
      const matchCategory = selectedCategory === "All";
      const matchTag = selectedTag === "All";

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

  return (
    <>
      <AppHeader />

      <div className="container">
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
              <div style={{ fontSize: 20, fontWeight: 900, letterSpacing: -0.3 }}>
                Catalog
              </div>
              <div style={{ color: "var(--muted)", fontSize: 13 }}>
                {loading ? "Loading products…" : `${filtered.length} item(s)`}
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
            </div>
          </div>
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "280px 1fr", gap: 16 }}>
          <aside
            className="card"
            style={{
              padding: 16,
              height: "fit-content",
              position: "sticky",
              top: 88,
            }}
          >
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
                <div style={{ fontSize: 12, color: "var(--muted)", marginBottom: 6 }}>
                  Category
                </div>
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
                <div style={{ fontSize: 12, color: "var(--muted)", marginBottom: 6 }}>
                  Tag
                </div>
                <select
                  className="input"
                  value={selectedTag}
                  onChange={(e) => setSelectedTag(e.target.value)}
                >
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
                <div style={{ color: "var(--muted)", marginTop: 6 }}>
                  Try a different search or reset filters.
                </div>
              </div>
            ) : (
              <div
                style={{
                  display: "grid",
                  gridTemplateColumns: "repeat(auto-fill, minmax(260px, 1fr))",
                  gap: 14,
                }}
              >
                {filtered.map((p) => {
                  const img = resolveImageSrc(p.image_url || p.imageUrl || "");
                  const link = resolveLink(p.target_url || p.linkUrl || "");
                  const title = getProductName(p);
                  const desc = (p.description || "").toString();
                  const extra = buildExtraFields(p).slice(0, 6); // in der Card kompakt

                  return (
                    <div
                      key={p.id}
                      className="card"
                      style={{
                        overflow: "hidden",
                        display: "flex",
                        flexDirection: "column",
                      }}
                    >
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
                          />
                        ) : (
                          <div style={{ color: "var(--muted)", fontSize: 13 }}>No image</div>
                        )}
                      </div>

                      <div
                        style={{
                          padding: 14,
                          display: "flex",
                          flexDirection: "column",
                          gap: 10,
                          flex: 1,
                        }}
                      >
                        <div>
                          <div style={{ fontWeight: 900, fontSize: 16, lineHeight: 1.2 }}>
                            {title}
                          </div>
                          {desc ? (
                            <div
                              style={{
                                color: "var(--muted)",
                                fontSize: 13,
                                marginTop: 6,
                                lineHeight: 1.45,
                              }}
                            >
                              {desc.length > 140 ? desc.slice(0, 140) + "…" : desc}
                            </div>
                          ) : null}
                        </div>

                        {extra.length ? (
                          <div style={{ display: "grid", gap: 6 }}>
                            {extra.map(([k, v]) => (
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
                                <span
                                  style={{
                                    color: "var(--text)",
                                    opacity: 0.9,
                                    textAlign: "right",
                                  }}
                                >
                                  {String(v)}
                                </span>
                              </div>
                            ))}
                          </div>
                        ) : (
                          <div style={{ color: "var(--muted)", fontSize: 12 }}>No extra fields</div>
                        )}

                        {/* ✅ Buttons: Details oben, Open bleibt */}
                        <div style={{ display: "grid", gap: 10, marginTop: "auto" }}>
                          <button
                            className="btn"
                            style={{ width: "100%" }}
                            onClick={() => setSelectedProduct(p)}
                          >
                            Details
                          </button>

                          {link ? (
                            <a
                              className="btn btnPrimary"
                              href={link}
                              target="_blank"
                              rel="noreferrer"
                              style={{ width: "100%" }}
                            >
                              Open
                            </a>
                          ) : (
                            <button
                              className="btn"
                              disabled
                              style={{ width: "100%", opacity: 0.55, cursor: "not-allowed" }}
                            >
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
                <div style={{ fontWeight: 900, fontSize: 18 }}>{title}</div>
                <button className="btn" onClick={() => setSelectedProduct(null)}>
                  ✕
                </button>
              </div>

              {img ? (
                <div style={{ marginTop: 14 }}>
                  <img
                    src={img}
                    alt={title}
                    style={{
                      width: "100%",
                      maxHeight: 420,
                      objectFit: "cover",
                      borderRadius: 12,
                      border: "1px solid var(--border)",
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
                <div style={{ fontWeight: 900, marginBottom: 10 }}>Fields</div>

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
                  <div style={{ color: "var(--muted)", fontSize: 13 }}>No extra fields</div>
                )}
              </div>

              <div style={{ marginTop: 16, display: "flex", gap: 10, flexWrap: "wrap" }}>
                {link ? (
                  <a
                    className="btn btnPrimary"
                    href={link}
                    target="_blank"
                    rel="noreferrer"
                  >
                    Open link
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

              {/* Optional: Quick jump to admin (falls du willst) */}
              {/* <div style={{ marginTop: 12, fontSize: 12, color: "var(--muted)" }}>
                <Link href="/admin/login">Admin</Link>
              </div> */}
            </div>
          </div>
        );
      })()}
    </>
  );
}