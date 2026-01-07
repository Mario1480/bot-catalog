import { AdminLayout } from "../../components/admin/AdminLayout";

export default function AdminCategories() {
  return (
    <AdminLayout title="Categories">
      <div className="card" style={{ padding: 16 }}>
        <div style={{ fontWeight: 900, marginBottom: 6 }}>Categories</div>
        <div style={{ color: "var(--muted)", lineHeight: 1.6 }}>
          Hier kommt als nächstes die Pflege der Kategorien rein (anlegen/umbenennen/löschen/sortieren).
          <br />
          Aktuell werden Kategorien bei Produkten über <code>product_fields</code> mit key <code>category</code> gespeichert (mehrfach möglich).
        </div>
      </div>
    </AdminLayout>
  );
}