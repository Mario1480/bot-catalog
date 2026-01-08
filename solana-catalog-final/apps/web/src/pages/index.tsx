// apps/web/src/pages/index.tsx
import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import bs58 from "bs58";
import { useWallet } from "@solana/wallet-adapter-react";

import { AppHeader } from "../components/AppHeader";
import { apiBase, apiFetch } from "../lib/api";

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
  const wallet = useWallet();

  const [gate, setGate] = useState<GatePreview | null>(null);
  const [gateErr, setGateErr] = useState("");

  const [status, setStatus] = useState<string>("Connect your wallet to access the catalog.");
  const [loading, setLoading] = useState(false);

  // Prevent repeated auth loops
  const authInFlightRef = useRef(false);
  const lastAuthedPubkeyRef = useRef<string | null>(null);

  // Load gate preview (public)
  useEffect(() => {
    setGateErr("");
    fetch(`${API}/gate/preview`)
      .then((r) => r.json())
      .then((d) => setGate(d))
      .catch(() => setGateErr("Failed to load token gate status"));
  }, [API]);

  // If JWT exists, validate it first. Only then redirect to /catalog.
  useEffect(() => {
    (async () => {
      const token =
        typeof window !== "undefined" ? localStorage.getItem("user_jwt") : null;

      if (!token) return;

      try {
        // If this succeeds, token is valid
        await apiFetch("/products", { method: "GET" }, token);
        window.location.href = "/catalog";
      } catch {
        // Token invalid/expired → remove it and stay on home
        localStorage.removeItem("user_jwt");
      }
    })();
  }, []);

  // Authenticate when wallet connects (nonce -> sign -> verify -> store JWT)
  useEffect(() => {
    if (!wallet.connected) {
      authInFlightRef.current = false;
      lastAuthedPubkeyRef.current = null;
      setLoading(false);
      setStatus("Connect your wallet to access the catalog.");
      return;
    }

    if (!wallet.publicKey) return;

    if (!wallet.signMessage) {
      setStatus("Your wallet does not support message signing. Please use Phantom.");
      return;
    }

    const pubkey = wallet.publicKey.toBase58();

    if (lastAuthedPubkeyRef.current === pubkey) return;
    if (authInFlightRef.current) return;

    (async () => {
      authInFlightRef.current = true;

      try {
        setLoading(true);
        setStatus("Requesting nonce…");

        const { message } = await apiFetch(`/auth/nonce?pubkey=${pubkey}`, {
          method: "GET",
        });

        setStatus("Signing message…");
        const sig = await wallet.signMessage(new TextEncoder().encode(message));
        const signatureBase58 = bs58.encode(sig);

        setStatus("Verifying token gate…");
        const out = await apiFetch(
          `/auth/verify`,
          {
            method: "POST",
            body: JSON.stringify({
              pubkey,
              signature: signatureBase58,
              message,
            }),
          }
        );

        localStorage.setItem("user_jwt", out.token);
        lastAuthedPubkeyRef.current = pubkey;

        setStatus("Access granted. Redirecting…");
        window.location.href = "/catalog";
      } catch (e: any) {
        lastAuthedPubkeyRef.current = null;

        const msg = (e?.message || "Authentication failed").toString();
        // if unauthorized/invalid -> wipe token so user can retry cleanly
        if (
          msg.toLowerCase().includes("unauthorized") ||
          msg.toLowerCase().includes("invalid token")
        ) {
          localStorage.removeItem("user_jwt");
        }

        setStatus(msg);
      } finally {
        authInFlightRef.current = false;
        setLoading(false);
      }
    })();
  }, [wallet.connected, wallet.publicKey, wallet.signMessage]);

  return (
    <>
      <AppHeader />

      <main style={{ maxWidth: 1100, margin: "0 auto", padding: 16 }}>
        <h1 style={{ fontSize: 32, fontWeight: 900 }}>uTrade Bot Catalog - Beta Version</h1>

        {/* Gate info */}
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
            <div style={{ fontWeight: 800, marginBottom: 6 }}>🔐 Token-Gated Access</div>

            {gate.mode === "usd" && (
              <div style={{ lineHeight: 1.5 }}>
                Required: <b>${(gate.requiredUsd ?? 0).toFixed(2)}</b>
                {gate.priceUsd ? (
                  <>
                    {" "}
                    (~{(gate.requiredTokens ?? 0).toFixed(2)} tokens · $
                    {gate.priceUsd.toFixed(4)} each)
                  </>
                ) : null}
              </div>
            )}

            {gate.mode === "amount" && (
              <div style={{ lineHeight: 1.5 }}>
                Required: <b>{(gate.requiredTokens ?? 0).toFixed(2)} tokens</b>
                {gate.priceUsd ? <> (~${(gate.requiredUsd ?? 0).toFixed(2)})</> : null}
              </div>
            )}

            <div style={{ marginTop: 10, fontSize: 14, opacity: 0.85 }}>
              Connect your wallet to unlock the full catalog.
            </div>

            <div style={{ marginTop: 10, fontSize: 13, opacity: 0.85 }}>
              <b>Status:</b> {loading ? "Working…" : status}
            </div>
          </div>
        ) : gate ? (
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
        ) : null}

        {gateErr ? (
          <div
            className="card"
            style={{
              marginTop: 20,
              padding: 14,
              background: "rgba(255,80,80,.08)",
              borderColor: "rgba(255,80,80,.35)",
            }}
          >
            {gateErr}
          </div>
        ) : null}

        {/* CTA */}
        <div style={{ marginTop: 30 }}>
          <Link href="/catalog" className="btn btnPrimary">
            Open Catalog
          </Link>
        </div>
      </main>
    </>
  );
}