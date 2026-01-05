import { useState } from "react";
import { apiBase } from "../../lib/api";

export default function AdminCsv() {
  const [err, setErr] = useState("");
  const [report, setReport] = useState<any>(null);

  const token = typeof window !== "undefined" ? localStorage.getItem("admin_jwt") || "" : "";
  const API = apiBase();

  async function upload(file: File) {
    setErr("");
    setReport(null);

    const form = new FormData();
    form.append("file", file);

    const res = await fetch(`${API}/admin/products/import-csv`, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}` },
      body: form
    });

    const data = await res.json();
    if (!res.ok) {
      setErr(data?.error || "Upload failed");
      return;
    }
    setReport(data);
  }

  function exportCsv() {
    window.open(`${API}/admin/products/export-csv`, "_blank");
  }

  return (
    <div style={{ maxWidth: 720, margin: "40px auto", padding: 16, fontFamily: "system-ui" }}>
      <h1>CSV Import / Export</h1>
      {err && <p style={{ color: "crimson" }}>{err}</p>}

      <div style={{ marginTop: 12 }}>
        <button onClick={exportCsv} style={{ padding: "10px 14px" }}>
          Export CSV
        </button>
      </div>

      <div style={{ marginTop: 16 }}>
        <input
          type="file"
          accept=".csv"
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) upload(f);
          }}
        />
      </div>

      {report && (
        <pre
          style={{
            marginTop: 16,
            background: "#f6f6f6",
            padding: 12,
            borderRadius: 8,
            overflowX: "auto"
          }}
        >
          {JSON.stringify(report, null, 2)}
        </pre>
      )}

      <p style={{ marginTop: 16, opacity: 0.7 }}>
        CSV columns: title,description,image_url,target_url,status,fields_json,tags
      </p>
      <p style={{ opacity: 0.7 }}>tags separated by | (pipe). fields_json is a JSON object.</p>
    </div>
  );
}