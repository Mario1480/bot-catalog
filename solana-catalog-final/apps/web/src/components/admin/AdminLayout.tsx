import { ReactNode, useEffect } from "react";
import Link from "next/link";
import { useRouter } from "next/router";

function isActive(pathname: string, href: string) {
  if (href === "/admin") return pathname === "/admin";
  return pathname.startsWith(href);
}

export function AdminLayout({
  children,
  title,
  requireAuth = true,
}: {
  children: ReactNode;
  title?: string;
  requireAuth?: boolean;
}) {
  const router = useRouter();

  useEffect(() => {
    if (!requireAuth) return;
    const token =
      typeof window !== "undefined" ? localStorage.getItem("admin_jwt") : null;
    if (!token) router.replace("/admin/login");
  }, [requireAuth, router]);

  const pathname = router.pathname;

  return (
    <div style={{ minHeight: "100vh", background: "var(--bg)" }}>
      <div style={{ display: "grid", gridTemplateColumns: "260px 1fr" }}>
        {/* Sidebar */}
        <aside
          style={{
            position: "sticky",
            top: 0,
            height: "100vh",
            borderRight: "1px solid var(--border)",
            background: "rgba(0,0,0,.18)",
            backdropFilter: "blur(10px)",
            padding: 16,
          }}
        >
          <Link
            href="/"
            style={{
              display: "flex",
              gap: 10,
              alignItems: "center",
              textDecoration: "none",
              marginBottom: 14,
            }}
          >
            <img
              src="/logo.png"
              alt="utrade"
              style={{ width: 100, height: 35, borderRadius: 0 }}
            />
            <div style={{ lineHeight: 1.1 }}>
              <div style={{ fontWeight: 900, color: "var(--text)" }}>
                utrade.vip
              </div>
              <div style={{ fontSize: 12, color: "var(--muted)" }}>Admin</div>
            </div>
          </Link>

          <nav style={{ display: "grid", gap: 8 }}>
            {[
              { href: "/admin", label: "Dashboard" },
              { href: "/admin/gate", label: "Token gating" },
              { href: "/admin/categories", label: "Categories" },
              { href: "/admin/products", label: "Products" },
              { href: "/admin/admins", label: "Admins" },
            ].map((item) => {
              const active = isActive(pathname, item.href);
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  className="btn"
                  style={{
                    justifyContent: "flex-start",
                    width: "100%",
                    background: active ? "rgba(255,193,7,.14)" : "transparent",
                    borderColor: active ? "rgba(255,193,7,.35)" : "var(--border)",
                    color: "var(--text)",
                  }}
                >
                  {item.label}
                </Link>
              );
            })}
          </nav>

          <div style={{ marginTop: 14, borderTop: "1px solid var(--border)", paddingTop: 14 }}>
            <button
              className="btn"
              style={{ width: "100%", justifyContent: "flex-start" }}
              onClick={() => {
                try {
                  localStorage.removeItem("admin_jwt");
                } catch {}
                router.push("/admin/login");
              }}
            >
              Logout
            </button>
          </div>
        </aside>

        {/* Content */}
        <main style={{ padding: 18 }}>
          <div
            className="card"
            style={{
              padding: 14,
              marginBottom: 16,
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              gap: 12,
              flexWrap: "wrap",
            }}
          >
            <div style={{ fontWeight: 900, fontSize: 18 }}>
              {title || "Admin"}
            </div>

            <div style={{ color: "var(--muted)", fontSize: 13 }}>
              Manage catalog & access
            </div>
          </div>

          {children}
        </main>
      </div>
    </div>
  );
}