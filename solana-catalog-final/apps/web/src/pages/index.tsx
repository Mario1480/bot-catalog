import { useEffect, useRef, useState } from "react";
import bs58 from "bs58";
import { useWallet } from "@solana/wallet-adapter-react";
import { AppHeader } from "../components/AppHeader";
import { apiFetch } from "../lib/api";

export default function Home() {
  const wallet = useWallet();

  const [status, setStatus] = useState<string>(
    "Connect your wallet to access the catalog."
  );
  const [loading, setLoading] = useState(false);

  // Prevent repeated auth loops
  const authInFlightRef = useRef(false);
  const lastAuthedPubkeyRef = useRef<string | null>(null);

  // If JWT already exists → go straight to catalog
  useEffect(() => {
    const token =
      typeof window !== "undefined"
        ? localStorage.getItem("user_jwt")
        : null;
    if (token) {
      window.location.href = "/catalog";
    }
  }, []);

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
      setStatus(
        "Your wallet does not support message signing. Please use Phantom."
      );
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

        const { message } = await apiFetch(
          `/auth/nonce?pubkey=${pubkey}`,
          { method: "GET" }
        );

        setStatus("Signing message…");
        const sig = await wallet.signMessage(
          new TextEncoder().encode(message)
        );
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

        localStorage.setItem("user_jwt", out.token);
        lastAuthedPubkeyRef.current = pubkey;

        setStatus("Access granted. Redirecting…");
        window.location.href = "/catalog";
      } catch (e: any) {
        lastAuthedPubkeyRef.current = null;
        setStatus(e?.message || "Authentication failed");
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

              <p
                style={{
                  marginTop: 10,
                  color: "var(--muted)",
                  lineHeight: 1.5,
                }}
              >
                Connect your wallet using the button above to unlock the catalog.
              </p>

              <div className="badge" style={{ marginTop: 16 }}>
                <span
                  className="badgeDot"
                  style={{
                    background: loading
                      ? "var(--brand)"
                      : "rgba(232,238,247,.35)",
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
              <ol
                style={{
                  margin: "10px 0 0 18px",
                  color: "var(--muted)",
                  lineHeight: 1.6,
                }}
              >
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