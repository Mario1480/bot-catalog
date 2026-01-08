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

  const [status, setStatus] = useState<string>("Connect your wallet to unlock the catalog.");
  const [loading, setLoading] = useState(false);
  const [jwtOk, setJwtOk] = useState(false);
  const [jwtChecking, setJwtChecking] = useState(false);

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

  // If JWT exists, validate it (but do NOT auto-redirect; user should click).
  useEffect(() => {
    (async () => {
      const token = typeof window !== "undefined" ? localStorage.getItem("user_jwt") || "" : "";
      if (!token) {
        setJwtOk(false);
        return;
      }

      setJwtChecking(true);
      try {
        // Validate token by calling a gated endpoint (same-origin JWT only).
        await apiFetch("/products?limit=1", { method: "GET" }, token);
        setJwtOk(true);
      } catch {
        localStorage.removeItem("user_jwt");
        setJwtOk(false);
      } finally {
        setJwtChecking(false);
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Authenticate when wallet connects (nonce -> sign -> verify -> store JWT)
  useEffect(() => {
    // On disconnect: don't redirect; just update UI state.
    if (!wallet.connected) {
      authInFlightRef.current = false;
      lastAuthedPubkeyRef.current = null;
      setLoading(false);
      setStatus("Wallet disconnected. You can reconnect to refresh access.");
      return;
    }

    if (!wallet.publicKey) return;

    if (!wallet.signMessage) {
      setStatus("Your wallet does not support message signing. Please use Phantom.");
      return;
    }

    const pubkey = wallet.publicKey.toBase58();

    // Prevent loops: only auth once per pubkey per page-load unless it failed.
    if (lastAuthedPubkeyRef.current === pubkey) return;
    if (authInFlightRef.current) return;

    // Cooldown per pubkey (avoid rapid retries if something fails)
    const now = Date.now();
    const key = `auth_cooldown_${pubkey}`;
    const last = typeof window !== "undefined" ? Number(sessionStorage.getItem(key) || "0") : 0;
    if (last && now - last < 5000) return;
    if (typeof window !== "undefined") sessionStorage.setItem(key, String(now));

    (async () => {
      authInFlightRef.current = true;

      try {
        setLoading(true);
        setStatus("Requesting nonce…");

        // IMPORTANT: include credentials so cookie-based flows work too.
        const nonceRes = await fetch(`${API}/auth/nonce?pubkey=${encodeURIComponent(pubkey)}`, {
          method: "GET",
          credentials: "include",
        });

        const nonceData: any = await nonceRes.json().catch(() => ({}));
        if (!nonceRes.ok) {
          throw new Error(nonceData?.error || `Nonce failed (${nonceRes.status})`);
        }

        const message = String(nonceData?.message || "");
        if (!message) throw new Error("Nonce missing message");

        setStatus("Signing message…");
        const sig = await wallet.signMessage(new TextEncoder().encode(message));
        const signatureBase58 = bs58.encode(sig);

        setStatus("Verifying access…");
        const verifyRes = await fetch(`${API}/auth/verify`, {
          method: "POST",
          credentials: "include",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ pubkey, signature: signatureBase58, message }),
        });

        const verifyData: any = await verifyRes.json().catch(() => ({}));
        if (!verifyRes.ok) {
          // If unauthorized -> clear token so user can retry cleanly
          if (verifyRes.status === 401 || verifyRes.status === 403) {
            if (typeof window !== "undefined") localStorage.removeItem("user_jwt");
            setJwtOk(false);
          }
          throw new Error(verifyData?.error || `Verify failed (${verifyRes.status})`);
        }

        const token = String(verifyData?.token || "");
        if (token) {
          if (typeof window !== "undefined") localStorage.setItem("user_jwt", token);
          setJwtOk(true);
          lastAuthedPubkeyRef.current = pubkey;
          setStatus("Access granted. You can open the catalog now.");
        } else {
          throw new Error("Verify missing token");
        }
      } catch (e: any) {
        lastAuthedPubkeyRef.current = null;

        const msg = (e?.message || "Authentication failed").toString();
        const lower = msg.toLowerCase();

        if (lower.includes("nonce") && (lower.includes("expired") || lower.includes("not found"))) {
          setStatus("Login session expired. Please disconnect and reconnect your wallet, then try again.");
        } else if (lower.includes("insufficient") || lower.includes("not enough") || lower.includes("gate")) {
          setStatus(
            "Access denied by token gate. This wallet doesn't meet the requirement yet. Top up the required tokens, then disconnect + reconnect and try again."
          );
        } else {
          setStatus(msg);
        }
      } finally {
        authInFlightRef.current = false;
        setLoading(false);
      }
    })();
  }, [API, wallet.connected, wallet.publicKey, wallet.signMessage]);

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
        <div style={{ marginTop: 30, display: "flex", gap: 12, flexWrap: "wrap", alignItems: "center" }}>
          {(() => {
            const gateEnabled = !!gate?.enabled;

            // If gating is OFF, allow direct access.
            if (!gateEnabled) {
              return (
                <Link href="/catalog" className="btn btnPrimary">
                  Open Catalog
                </Link>
              );
            }

            // If gating is ON, only allow entering catalog when we confirmed the JWT is valid.
            if (jwtOk) {
              return (
                <Link href="/catalog" className="btn btnPrimary">
                  Open Catalog
                </Link>
              );
            }

            // Otherwise: show disabled button + hint.
            return (
              <>
                <button className="btn btnPrimary" disabled>
                  {jwtChecking ? "Checking…" : "No Access"}
                </button>
                <span style={{ fontSize: 13, color: "var(--muted)", opacity: 0.9 }}>
                  {jwtChecking ? "Validating access…" : "Connect your wallet to unlock."}
                </span>
              </>
            );
          })()}
        </div>
      </main>
    </>
  );
}