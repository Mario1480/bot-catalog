import Link from "next/link";
import { useRouter } from "next/router";
import { WalletConnect } from "./WalletConnect";

export function AppHeader() {
  const router = useRouter();
  const isCatalog = router.pathname.startsWith("/catalog");

  return (
    <div
      style={{
        borderBottom: "0px solid var(--border)",
        background: "rgba(0,0,0,.2)",
        position: "sticky",
        top: 0,
        zIndex: 20,
        backdropFilter: "blur(10px)",
      }}
    >
      <div
        className="container"
        style={{
          paddingTop: 12,
          paddingBottom: 12,
        }}
      >
        {/* Row 1: Brand left, Wallet right */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            gap: 12,
          }}
        >
          <Link
            href="/"
            style={{
              display: "flex",
              alignItems: "center",
              gap: 12,
              textDecoration: "none",
              minWidth: 0,
            }}
          >
            <img
              src="/logo.png"
              alt="utrade"
              style={{
                width: 100,
                height: 35,
                borderRadius: 0,
                objectFit: "contain",
                background: "rgba(255,255,255,.04)",
                border: "0px solid rgba(255,255,255,.08)",
                padding: 6,
              }}
            />
            <div style={{ lineHeight: 1.1, minWidth: 0 }}>
              <div
                style={{
                  fontWeight: 900,
                  whiteSpace: "nowrap",
                  overflow: "hidden",
                  textOverflow: "ellipsis",
                  maxWidth: 220,
                }}
              >
                utrade.vip
              </div>
              <div
                style={{
                  fontSize: 12,
                  color: "var(--muted)",
                  whiteSpace: "nowrap",
                  overflow: "hidden",
                  textOverflow: "ellipsis",
                  maxWidth: 220,
                }}
              >
                Bot Catalog 
              </div>
            </div>
          </Link>

          {/* ✅ Wallet always top-right */}
          <div style={{ flexShrink: 0 }}>
            <WalletConnect />
          </div>
        </div>

        {/* Row 2: Nav (wraps nicely on mobile) */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 10,
            marginTop: 10,
            flexWrap: "wrap",
          }}
        >
          <Link
            href="/catalog"
            className="btn"
            style={{
              padding: "10px 14px",
              borderRadius: 10,
              fontWeight: 800,
              background: isCatalog ? "#FFC107" : "transparent",
              color: isCatalog ? "#111" : "var(--text)",
              border: isCatalog ? "1px solid rgba(255,193,7,.55)" : "1px solid rgba(255,255,255,.14)",
            }}
          >
            Catalog
          </Link>

          <Link
            href="/admin/login"
            className="btn"
            style={{
              padding: "10px 14px",
              borderRadius: 10,
              fontWeight: 700,
              border: "1px solid rgba(255,255,255,.14)",
            }}
          >
            Admin
          </Link>
        </div>
      </div>
    </div>
  );
}