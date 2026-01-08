import { useEffect, useMemo, useState } from "react";
import { apiFetch } from "../../lib/api";
import { AdminLayout } from "../../components/admin/AdminLayout";

type ProductRow = {
  id: string;
  title: string;
  status: string;
  target_url?: string;
  updated_at?: string;
};

function qp(name: string): string {
  if (typeof window === "undefined") return "";
  const u = new URL(window.location.href);
  return u.searchParams.get(name) || "";
}

function qpNum(name: string, fallback: number): number {
  const raw = qp(name);
  const n = Number(raw);
  return Number.isFinite(n) && n > 0 ? n : fallback;
}

export default function AdminProductsList() {
  const [items, setItems] = useState<ProductRow[]>([]);
  const [search, setSearch] = useState("");
  const [err, setErr] = useState("");
  const [loading, setLoading] = useState(false);

  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);

  const token =
    typeof window !== "undefined" ? localStorage.getItem("admin_jwt") || "" : "";

  // init from URL
  useEffect(() => {
    const s = qp("search");
    const p = qpNum("page", 1);
    const ps = qpNum("pageSize", 20);

    if (s) setSearch(s);
    setPage(p);
    setPageSize(Math.min(50, ps)); // backend caps anyway
  }, []);

  function syncUrl(next: { search?: string; page?: number; pageSize?: number }) {
    if (typeof window === "undefined") return;
    const u = new URL(window.location.href);

    const s = next.search ?? search;
    const p = next.page ?? page;
    const ps = next.pageSize ?? pageSize;

    if (s) u.searchParams.set("search", s);
    else u.searchParams.delete("search");

    u.searchParams.set("page", String(p));
    u.searchParams.set("pageSize", String(ps));

    window.history.replaceState({}, "", u.toString());
  }

  async function load(opts?: { page?: number; pageSize?: number; search?: string }) {
    const p = opts?.page ?? page;
    const ps = opts?.pageSize ?? pageSize;
    const s = opts?.search ?? search;

    setErr("");
    setLoading(true);

    try {
      const params = new URLSearchParams();
      if (s) params.set("search", s);
      params.set("page", String(p));
      params.set("pageSize", String(ps));

      const out = await apiFetch(`/admin/products?${params.toString()}`, { method: "GET" }, token);
      setItems(Array.isArray(out) ? out : []);

      // keep URL in sync
      syncUrl({ search: s, page: p, pageSize: ps });
    } catch (e: any) {
      setErr(e?.message || "Failed");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    // initial load after URL init
    // eslint-disable-next-line react-hooks/exhaustive-deps
    load({ page, pageSize, search });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [page, pageSize]);

  const canPrev = page > 1;
  // Backend currently returns only rows (no total). We infer "hasNext" by a full page.
  const hasNext = items.length === pageSize;

  const rangeText = useMemo(() => {
    if (!items.length) return "No results";
    const from = (page - 1) * pageSize + 1;
    const to = (page - 1) * pageSize + items.length;
    return `Showing ${from}–${to}`;
  }, [items.length, page, pageSize]);

  async function doDelete(p: ProductRow) {
    if (!confirm(`Delete product "${p.title}"?`)) return;
    setErr("");
    try {
      await apiFetch(`/admin/products/${p.id}`, { method: "DELETE" }, token);

      // If we deleted the last item on the page, step back one page (if possible)
      const isLastOnPage = items.length === 1;
      if (isLastOnPage && page > 1) {
        setPage(page - 1);
      } else {
        await load({ page, pageSize, search });
      }
    } catch (e: any) {
      setErr(e?.message || "Delete failed");
    }
  }

  return (
    <AdminLayout title="Products">
      <div style={{ maxWidth: 1100 }}>
        {err && <p style={{ color: "crimson" }}>{err}</p>}

        <div className="card" style={{ padding: 14 }}>
          <div style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "center" }}>
            <input
              className="input"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search..."
              style={{ flex: 1, minWidth: 220 }}
            />

            <button
              className="btn"
              onClick={() => {
                setPage(1);
                load({ page: 1, pageSize, search });
              }}
              disabled={loading}
            >
              {loading ? "Loading…" : "Search"}
            </button>

            <select
              className="input"
              value={pageSize}
              onChange={(e) => {
                const ps = Math.min(50, Math.max(1, Number(e.target.value) || 20));
                setPageSize(ps);
                setPage(1);
                // load is triggered by effect (page/pageSize)
              }}
              style={{ width: 120 }}
              title="Items per page"
            >
              <option value={10}>10 / page</option>
              <option value={20}>20 / page</option>
              <option value={30}>30 / page</option>
              <option value={50}>50 / page</option>
            </select>

            <button
              className="btn btnPrimary"
              onClick={() => (window.location.href = "/admin/products-edit")}
            >
              Create
            </button>
          </div>

          <div
            style={{
              marginTop: 10,
              display: "flex",
              justifyContent: "space-between",
              gap: 10,
              flexWrap: "wrap",
              alignItems: "center",
              color: "var(--muted)",
              fontSize: 13,
            }}
          >
            <div>{rangeText}</div>

            <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
              <button
                className="btn"
                disabled={!canPrev || loading}
                onClick={() => setPage((p) => Math.max(1, p - 1))}
              >
                Prev
              </button>

              <div style={{ minWidth: 90, textAlign: "center" }}>
                Page <b>{page}</b>
              </div>

              <button
                className="btn"
                disabled={!hasNext || loading}
                onClick={() => setPage((p) => p + 1)}
              >
                Next
              </button>
            </div>
          </div>
        </div>

        <div className="card" style={{ padding: 0, marginTop: 14, overflow: "hidden" }}>
          <table style={{ width: "100%", borderCollapse: "collapse" }}>
            <thead>
              <tr>
                <th style={{ textAlign: "left", borderBottom: "1px solid var(--border)", padding: 12 }}>
                  Title
                </th>
                <th style={{ textAlign: "left", borderBottom: "1px solid var(--border)", padding: 12 }}>
                  Status
                </th>
                <th style={{ textAlign: "left", borderBottom: "1px solid var(--border)", padding: 12 }}>
                  Updated
                </th>
                <th style={{ borderBottom: "1px solid var(--border)", padding: 12 }} />
              </tr>
            </thead>
            <tbody>
              {items.map((p) => (
                <tr key={p.id}>
                  <td style={{ padding: 12, borderBottom: "1px solid var(--border)" }}>{p.title}</td>
                  <td style={{ padding: 12, borderBottom: "1px solid var(--border)" }}>{p.status}</td>
                  <td style={{ padding: 12, borderBottom: "1px solid var(--border)" }}>
                    {p.updated_at ? new Date(p.updated_at).toLocaleString() : "-"}
                  </td>
                  <td style={{ padding: 12, borderBottom: "1px solid var(--border)", textAlign: "right" }}>
                    <div style={{ display: "flex", gap: 10, justifyContent: "flex-end", flexWrap: "wrap" }}>
                      <button
                        className="btn"
                        onClick={() => (window.location.href = `/admin/products-edit?id=${p.id}`)}
                      >
                        Edit
                      </button>

                      <button
                        className="btn"
                        onClick={() => doDelete(p)}
                        style={{
                          borderColor: "rgba(255,80,80,.35)",
                          background: "rgba(255,80,80,.08)",
                        }}
                      >
                        Delete
                      </button>
                    </div>
                  </td>
                </tr>
              ))}

              {items.length === 0 && !loading && (
                <tr>
                  <td colSpan={4} style={{ padding: 14, opacity: 0.75 }}>
                    No products found.
                  </td>
                </tr>
              )}

              {loading && (
                <tr>
                  <td colSpan={4} style={{ padding: 14, opacity: 0.75 }}>
                    Loading…
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        <div style={{ marginTop: 12, opacity: 0.7, fontSize: 13 }}>
          Tip: use the editor page to upload an image and edit fields/tags.
        </div>
      </div>
    </AdminLayout>
  );
}