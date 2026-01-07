import { useEffect, useState } from "react";
import Link from "next/link";

export default function AdminHome() {
  const [token, setToken] = useState("");

  useEffect(() => {
    const t = typeof window !== "undefined" ? localStorage.getItem("admin_jwt") || "" : "";
    if (!t) window.location.href = "/admin/login";
    setToken(t);
  }, []);

  if (!token) return null;

  return (
    <div style={{ maxWidth: 980, margin: "40px auto", padding: 16, fontFamily: "system-ui" }}>
      <h1 style={{ margin: 0 }}>Admin Dashboard</h1>
      <p style={{ marginTop: 8, opacity: 0.8 }}>
        Choose what you want to manage.
      </p>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))", gap: 12, marginTop: 16 }}>
        <Card title="Token Gating" desc="Configure mint + min amount / USD gate" href="/admin/gate" />
        <Card title="Categories" desc="Manage category list (checkbox options)" href="/admin/categories" />
        <Card title="Products" desc="Create and edit catalog products" href="/admin/products" />
        <Card title="CSV Import/Export" desc="Bulk import/export products" href="/admin/csv" />
        <Card title="Admins" desc="Create additional admin users" href="/admin/admins" />
      </div>
    </div>
  );
}

function Card({ title, desc, href }: { title: string; desc: string; href: string }) {
  return (
    <Link
      href={href}
      style={{
        display: "block",
        padding: 16,
        borderRadius: 12,
        border: "1px solid rgba(255,255,255,.12)",
        background: "rgba(255,255,255,.03)",
        textDecoration: "none",
        color: "inherit",
      }}
    >
      <div style={{ fontWeight: 900, fontSize: 16 }}>{title}</div>
      <div style={{ marginTop: 6, fontSize: 13, opacity: 0.8, lineHeight: 1.4 }}>{desc}</div>
      <div style={{ marginTop: 10, fontSize: 13, fontWeight: 700 }}>Open →</div>
    </Link>
  );
}