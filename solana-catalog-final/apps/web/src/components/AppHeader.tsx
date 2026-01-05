import Link from "next/link";

export function AppHeader() {
  return (
    <div style={{ borderBottom: "1px solid var(--border)", background: "rgba(0,0,0,.2)", position: "sticky", top: 0, zIndex: 20, backdropFilter: "blur(10px)" }}>
      <div className="container" style={{ paddingTop: 14, paddingBottom: 14, display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <Link href="/" style={{ display: "flex", alignItems: "center", gap: 12, textDecoration: "none" }}>
          <img src="/logo.png" alt="utrade" style={{ width: 34, height: 34, borderRadius: 10 }} />
          <div style={{ lineHeight: 1.1 }}>
            <div style={{ fontWeight: 800 }}>utrade.vip</div>
            <div style={{ fontSize: 12, color: "var(--muted)" }}>Token-gated Bot Catalog</div>
          </div>
        </Link>

        <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
          <Link className="btn" href="/catalog">Catalog</Link>
          <Link className="btn" href="/admin/login">Admin</Link>
        </div>
      </div>
    </div>
  );
}