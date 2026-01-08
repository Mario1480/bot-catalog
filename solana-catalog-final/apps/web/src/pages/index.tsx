import { useEffect, useState } from "react";
import Link from "next/link";
import { apiBase } from "../lib/api";
import { AppLayout } from "../components/AppLayout";

type GatePreview = {
  enabled: boolean;
  mode: "usd" | "amount" | "none";
  priceUsd: number | null;
  requiredUsd: number | null;
  requiredTokens: number | null;
  mint_address: string;
};

export default function HomePage() {
  const API = apiBase();

  const [gate, setGate] = useState<GatePreview | null>(null);
  const [err, setErr] = useState("");

  useEffect(() => {
    fetch(`${API}/gate/preview`)
      .then((r) => r.json())
      .then(setGate)
      .catch(() => setErr("Failed to load token gate status"));
  }, [API]);

  return (
    <AppLayout>
    <main style={{ maxWidth: 1100, margin: "0 auto", padding: 16 }}>
      <h1 style={{ fontSize: 32, fontWeight: 900 }}>uTrade Bot Catalog</h1>

      {/* Token gate info */}
      {gate?.enabled ? (
        <div
          className="card"
          style={{
            marginTop: 20,
            padding: 16,
            background: "rgba(0,150,255,.08)",
            borderColor: "rgba(0,150,255,.25)",
          }}
        >
          <div style={{ fontWeight: 800, marginBottom: 6 }}>
            🔐 Token‑Gated Access
          </div>

          {gate.mode === "usd" && (
            <div style={{ lineHeight: 1.5 }}>
              Required: <b>${gate.requiredUsd?.toFixed(2)}</b>
              {gate.priceUsd ? (
                <>
                  {" "}
                  (~{gate.requiredTokens?.toFixed(2)} tokens · $
                  {gate.priceUsd.toFixed(4)} each)
                </>
              ) : null}
            </div>
          )}

          {gate.mode === "amount" && (
            <div style={{ lineHeight: 1.5 }}>
              Required: <b>{gate.requiredTokens?.toFixed(2)} tokens</b>
              {gate.priceUsd ? (
                <> (~${gate.requiredUsd?.toFixed(2)})</>
              ) : null}
            </div>
          )}

          <div style={{ marginTop: 10, fontSize: 14, opacity: 0.85 }}>
            Connect your wallet to unlock the full catalog.
          </div>
        </div>
      ) : (
        <div
          className="card"
          style={{
            marginTop: 20,
            padding: 16,
            background: "rgba(0,200,100,.08)",
            borderColor: "rgba(0,200,100,.25)",
          }}
        >
          <b>✅ Access open</b> – no token required.
        </div>
      )}

      {err ? (
        <div
          className="card"
          style={{
            marginTop: 20,
            padding: 14,
            background: "rgba(255,80,80,.08)",
            borderColor: "rgba(255,80,80,.35)",
          }}
        >
          {err}
        </div>
      ) : null}

      {/* CTA */}
      <div style={{ marginTop: 30 }}>
        <Link href="/catalog" className="btn btnPrimary">
          Open Catalog
        </Link>
      </div>
    </main>
    </AppLayout>
  );
}