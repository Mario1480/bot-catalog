// apps/web/src/pages/index.tsx
import { useEffect, useRef, useState } from "react";
import bs58 from "bs58";
import { useWallet } from "@solana/wallet-adapter-react";
import { AppHeader } from "../components/AppHeader";
import { apiFetch } from "../lib/api";

function notifyJwtChanged() {
  try {
    window.dispatchEvent(new Event("user_jwt_changed"));
  } catch {}
}

export default function Home() {
  const wallet = useWallet();

  const [status, setStatus] = useState("Connect your wallet to access the catalog.");
  const [loading, setLoading] = useState(false);

  // prevents double-sign / repeated auth loops
  const authInFlightRef = useRef(false);
  const lastAttemptPubkeyRef = useRef<string | null>(null);

  // If JWT already exists, validate once and redirect.
  useEffect(() => {
    (async () => {
      if (typeof window === "undefined") return;

      const token = localStorage.getItem("user_jwt") || "";
      if (!token) return;

      try {
        await apiFetch("/products", { method: "GET" }, token);
        window.location.href = "/catalog";
      } catch {
        localStorage.removeItem("user_jwt");
        localStorage.removeItem("user_pubkey");
        notifyJwtChanged();
      }
    })();
  }, []);

  useEffect(() => {
    if (typeof window === "undefined") return;

    if (!wallet.connected) {
      authInFlightRef.current = false;
      lastAttemptPubkeyRef.current = null;
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

    // If we already have a token for this pubkey, just go to catalog (no re-sign)
    const existingJwt = localStorage.getItem("user_jwt") || "";
    const existingPk = localStorage.getItem("user_pubkey") || "";
    if (existingJwt && existingPk === pubkey) {
      setStatus("Access already granted. Redirecting…");
      window.location.href = "/catalog";
      return;
    }

    // Hard lock: prevents multiple concurrent auth runs (and double signature prompts)
    if (authInFlightRef.current) return;

    // If effect re-triggers quickly with same pubkey, don't start again
    if (lastAttemptPubkeyRef.current === pubkey) return;

    // optimistic lock BEFORE any awaits
    authInFlightRef.current = true;
    lastAttemptPubkeyRef.current = pubkey;

    (async () => {
      try {
        setLoading(true);
        setStatus("Requesting nonce…");

        const nonceResp = await apiFetch(`/auth/nonce?pubkey=${encodeURIComponent(pubkey)}`, {
          method: "GET",
        });

        const message = String(nonceResp?.message || "");
        if (!message) throw new Error("Nonce response missing message");

        setStatus("Signing message…");
        const sig = await wallet.signMessage(new TextEncoder().encode(message));
        const signatureBase58 = bs58.encode(sig);

        setStatus("Verifying token gate…");
        const out = await apiFetch(`/auth/verify`, {
          method: "POST",
          body: JSON.stringify({
            pubkey,
            signature: signatureBase58,
            message,
          }),
        });

        const token = String(out?.token || "");
        if (!token) throw new Error("Verify response missing token");

        localStorage.setItem("user_jwt", token);
        localStorage.setItem("user_pubkey", pubkey);
        notifyJwtChanged();

        setStatus("Access granted. Redirecting…");
        window.location.href = "/catalog";
      } catch (e: any) {
        // allow retry
        lastAttemptPubkeyRef.current = null;

        const msg = (e?.message || "Authentication failed").toString();
        // wipe stale tokens
        localStorage.removeItem("user_jwt");
        localStorage.removeItem("user_pubkey");
        notifyJwtChanged();

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

      <div className="container">
        <div className="card" style={{ padding: 22 }}>
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "1.2fr .8fr",
              gap: 18,
              alignItems: "center",
            }}
          >
            <div>
              <h1 style={{ margin: 0, fontSize: 34, letterSpacing: -0.5 }}>
                uTrade Bot Catalog
              </h1>

              <p style={{ marginTop: 10, color: "var(--muted)", lineHeight: 1.5 }}>
                Connect your wallet using the button above to unlock the catalog.
              </p>

              <div className="badge" style={{ marginTop: 16 }}>
                <span
                  className="badgeDot"
                  style={{
                    background: loading ? "var(--brand)" : "rgba(232,238,247,.35)",
                  }}
                />
                {loading ? "Working…" : status}
              </div>
            </div>

            <div
              className="card"
              style={{
                padding: 18,
                background: "rgba(255,193,7,.08)",
                borderColor: "rgba(255,193,7,.25)",
              }}
            >
              <div style={{ fontWeight: 800 }}>How it works</div>
              <ol style={{ margin: "10px 0 0 18px", color: "var(--muted)", lineHeight: 1.6 }}>
                <li>Connect wallet (top right)</li>
                <li>Sign a message</li>
                <li>We verify token balance/value</li>
                <li>Catalog unlocks automatically</li>
              </ol>
            </div>
          </div>
        </div>
      </div>
    </>
  );
}