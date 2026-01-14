// apps/web/src/pages/admin/csv.tsx
import { useState } from "react";
import { AdminLayout } from "../../components/admin/AdminLayout";
import { apiBase } from "../../lib/api";

export default function AdminCsvPage() {
  const [err, setErr] = useState("");
  const [msg, setMsg] = useState<string>("");
  const [busy, setBusy] = useState(false);

  const API = apiBase();
  const token =
    typeof window !== "undefined" ? localStorage.getItem("admin_jwt") || "" : "";

  async function exportCsv() {
    setErr("");
    setMsg("");
    setBusy(true);
    try {
      const res = await fetch(`${API}/admin/products/export-csv`, {
        method: "GET",
        headers: {
          Authorization: `Bearer ${token}`,
        },
      });

      const text = await res.text();
      if (!res.ok) {
        // backend könnte JSON oder text liefern
        throw new Error(text || `Export failed (${res.status})`);
      }

      const blob = new Blob([text], { type: "text/csv;charset=utf-8" });
      const url = window.URL.createObjectURL(blob);

      const a = document.createElement("a");
      a.href = url;
      a.download = "products_export.csv";
      document.body.appendChild(a);
      a.click();
      a.remove();
      window.URL.revokeObjectURL(url);

      setMsg("CSV export downloaded.");
    } catch (e: any) {
      setErr(e?.message || "Export failed");
    } finally {
      setBusy(false);
    }
  }

  async function importCsv(file: File) {
    setErr("");
    setMsg("");
    setBusy(true);

    try {
      const form = new FormData();
      form.append("file", file);

      const res = await fetch(`${API}/admin/products/import-csv`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
        },
        body: form,
      });

      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data?.error || "Import failed");

      setMsg(`Imported: ${data.imported ?? 0}`);
    } catch (e: any) {
      setErr(e?.message || "Import failed");
    } finally {
      setBusy(false);
    }
  }

  return (
    <AdminLayout title="CSV Import / Export">
      <div className="card" style={{ padding: 16 }}>
        {err ? (
          <div className="card" style={{ padding: 12, marginBottom: 12, borderColor: "#6b1b1b" }}>
            <div style={{ fontWeight: 800 }}>Error</div>
            <div style={{ opacity: 0.9 }}>{err}</div>
          </div>
        ) : null}

        {msg ? (
          <div className="card" style={{ padding: 12, marginBottom: 12 }}>
            <div style={{ fontWeight: 800 }}>OK</div>
            <div style={{ opacity: 0.9 }}>{msg}</div>
          </div>
        ) : null}

        <div style={{ display: "grid", gap: 12, maxWidth: 520 }}>
          <button className="btn" onClick={exportCsv} disabled={busy}>
            {busy ? "Working…" : "Export CSV"}
          </button>

          <label style={{ display: "grid", gap: 8 }}>
            <div style={{ opacity: 0.8 }}>
              Import CSV (semicolon “;” format like your file)
            </div>
            <input
              type="file"
              accept=".csv,text/csv"
              disabled={busy}
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) importCsv(f);
              }}
            />
          </label>

          <div style={{ opacity: 0.75, fontSize: 13, lineHeight: 1.4 }}>
            <div><b>Expected columns (semicolon separated):</b></div>
            <div>
              ID; Name; Description; Image; Category; Tags; Trading; Leverage; Price...Loss (SL);
              Take-Profit (TP); Minimum Invest; Start Level; Bot Link
            </div>
            <div style={{ marginTop: 8 }}>
              Categories can be separated by <code>|</code> or <code>,</code>. Tags too.
            </div>
          </div>
        </div>
      </div>
    </AdminLayout>
  );
}
