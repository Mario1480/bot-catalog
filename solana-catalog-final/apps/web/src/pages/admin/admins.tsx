import { AdminLayout } from "../../components/admin/AdminLayout";

export default function AdminAdmins() {
  return (
    <AdminLayout title="Admins">
      <div className="card" style={{ padding: 16 }}>
        <div style={{ fontWeight: 900, marginBottom: 6 }}>Admin users</div>
        <div style={{ color: "var(--muted)", lineHeight: 1.6 }}>
          Hier kommt als nächstes:
          <ul style={{ margin: "10px 0 0 18px" }}>
            <li>Admins auflisten</li>
            <li>Neue Admins anlegen</li>
            <li>Passwort reset / deaktivieren</li>
          </ul>
        </div>
      </div>
    </AdminLayout>
  );
}