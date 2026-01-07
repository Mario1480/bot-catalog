import Link from "next/link";
import { AdminLayout } from "../../components/admin/AdminLayout";

export default function AdminHome() {
  return (
    <AdminLayout title="Dashboard">
      <div style={{ display: "grid", gap: 14 }}>
        <div className="card" style={{ padding: 16 }}>
          <div style={{ fontWeight: 900, marginBottom: 6 }}>Quick actions</div>
          <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
            <Link className="btn btnPrimary" href="/admin/products-edit">
              + New product
            </Link>
            <Link className="btn" href="/admin/products">
              Products
            </Link>
            <Link className="btn" href="/admin/gate">
              Token gating
            </Link>
          </div>
        </div>

        <div className="card" style={{ padding: 16 }}>
          <div style={{ fontWeight: 900 }}>Coming next</div>
          <ul style={{ margin: "10px 0 0 18px", color: "var(--muted)", lineHeight: 1.6 }}>
            <li>KPIs (products, views, conversions)</li>
            <li>Latest edits</li>
            <li>Token-gate health check</li>
          </ul>
        </div>
      </div>
    </AdminLayout>
  );
}