import { useEffect, useState } from "react";
import { apiFetch, apiBase } from "../lib/api";
import { WalletConnect } from "../components/WalletConnect";

type Product = {
  id: string;
  title: string;
  description: string;
  image_url: string;
  target_url: string;
};

export default function Catalog() {
  const [products, setProducts] = useState<Product[]>([]);
  const [filters, setFilters] = useState<Record<string, string[]>>({});
  const [active, setActive] = useState<Record<string, string>>({});
  const [search, setSearch] = useState("");
  const [err, setErr] = useState("");

  const token = typeof window !== "undefined" ? localStorage.getItem("user_jwt") || "" : "";
  const ABS_API = apiBase();

  async function loadFilters() {
    const f = await apiFetch("/products/filters", { method: "GET" }, token);
    setFilters(f);
  }

  async function loadProducts() {
    const params = new URLSearchParams();
    if (search) params.set("search", search);
    Object.entries(active).forEach(([k, v]) => params.set(`filters[${k}]`, v));

    const p = await apiFetch(`/products?${params.toString()}`, { method: "GET" }, token);
    setProducts(p);
  }

  useEffect(() => {
    (async () => {
      try {
        await loadFilters();
        await loadProducts();
      } catch (e: any) {
        setErr(e.message || "Failed to load");
      }
    })();
  }, []);

  return (
    <div style={{ maxWidth: 1000, margin: "40px auto", padding: 16, fontFamily: "system-ui" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <h1>Catalog</h1>
        <WalletConnect />
      </div>

      {err && <p style={{ color: "crimson" }}>{err}</p>}

      <div style={{ display: "flex", gap: 12, marginTop: 16 }}>
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search..."
          style={{ flex: 1, padding: 10 }}
        />
        <button onClick={loadProducts} style={{ padding: "10px 14px" }}>
          Search
        </button>
      </div>

      <div style={{ marginTop: 16, display: "flex", flexWrap: "wrap", gap: 10 }}>
        {Object.entries(filters).map(([key, values]) => (
          <select
            key={key}
            value={active[key] || ""}
            onChange={(e) => {
              const v = e.target.value;
              const next = { ...active };
              if (!v) delete next[key];
              else next[key] = v;
              setActive(next);
            }}
            style={{ padding: 10 }}
          >
            <option value="">{key}: (all)</option>
            {values.map((v) => (
              <option key={v} value={v}>
                {v}
              </option>
            ))}
          </select>
        ))}
        <button onClick={loadProducts} style={{ padding: "10px 14px" }}>
          Apply
        </button>
      </div>

      <div
        style={{
          marginTop: 24,
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))",
          gap: 16
        }}
      >
        {products.map((p) => {
          // English comment: If image_url is a local path, prefix API base.
          const img = p.image_url?.startsWith("/uploads/") ? `${ABS_API}${p.image_url}` : p.image_url;

          return (
            <div key={p.id} style={{ border: "1px solid #ddd", borderRadius: 12, padding: 12 }}>
              {img && (
                <img
                  src={img}
                  alt={p.title}
                  style={{ width: "100%", height: 180, objectFit: "cover", borderRadius: 10 }}
                />
              )}
              <h3 style={{ marginTop: 12 }}>{p.title}</h3>
              <p style={{ opacity: 0.8 }}>{p.description}</p>
              <a href={p.target_url} target="_blank" rel="noreferrer">
                <button style={{ padding: "10px 14px", width: "100%" }}>Open link</button>
              </a>
            </div>
          );
        })}
      </div>
    </div>
  );
}