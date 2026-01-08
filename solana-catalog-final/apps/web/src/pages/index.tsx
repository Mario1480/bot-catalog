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

type GatePreview = {
  enabled: boolean;
  mode: "amount" | "usd" | "none";
  mint_address: string;
  min_amount: number | null;
  min_usd: number | null;
  tolerance_percent: number;
  priceUsd: number | null;
  requiredUsd: number | null;
  requiredTokens: number | null;
};

export default function Home() {
  const wallet = useWallet();

  const [status, setStatus] = useState("Connect your wallet to access the catalog.");
  const [loading, setLoading] = useState(false);

  const [gate, setGate] = useState<GatePreview | null>(null);
  const [gateErr, setGateErr] = useState("");

  // Prevent repeated auth loops
  const authInFlightRef = useRef(false);

  // Load public gate preview (price + requirement)
  useEffect(() => {
    (async () => {
      try {
        setGateErr("");
        const out = await apiFetch("/gate-preview", { method: "GET" });
        setGate(out as GatePreview);
      } catch (e: any) {
        setGateErr(e?.message || "Failed to load gate info");
        setGate(null);
      }
    })();
  }, []);

  // If JWT exists, validate and redirect (only once per mount)
  useEffect(() => {
    (async () => {
      const token = typeof window !== "undefined" ? localStorage.getItem("user_jwt") : null;
      if (!token) return;

      try {
        await apiFetch("/products", { method: "GET" }, token);
        window.location.href = "/catalog";
      } catch {
        try {
          localStorage.removeItem("user_jwt");
          localStorage.removeItem("user_pubkey");
        } catch {}
        notifyJwtChanged();
      }
    })();
  }, []);

  useEffect(() => {
    if (!wallet.connected) {
      authInFlightRef.current = false;
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

    // If we already have a valid JWT, do NOT request another signature.
    const existingJwt = typeof window !== "undefined" ? localStorage.getItem("user_jwt") : null;
    const existingPk = typeof window !== "undefined" ? localStorage.getItem("user_pubkey") : null;

    if (existingJwt && existingPk === pubkey) {
      // Let the "validate+redirect" effect handle it (or user can go manually)
      setStatus("Wallet connected. Session already exists.");
      return;
    }

    if (authInFlightRef.current) return;

    (async () => {
      authInFlightRef.current = true;

      try {
        setLoading(true);
        setStatus("Requesting nonce…");

        const { message } = await apiFetch(`/auth/nonce?pubkey=${pubkey}`, { method: "GET" });

        setStatus("Signing message…");
        const sig = await wallet.signMessage(new TextEncoder().encode(message));
        const signatureBase58 = bs58.encode(sig);

        setStatus("Verifying token gate…");
        const out = await apiFetch(`/auth/verify`, {
          method: "POST",
          body: JSON.stringify({ pubkey, signature: signatureBase58, message }),
        });

        localStorage.setItem("user_jwt", out.token);
        localStorage.setItem("user_pubkey", pubkey);
        notifyJwtChanged();

        setStatus("Access granted. Redirecting…");
        window.location.href = "/catalog";
      } catch (e: any) {
        const msg = (e?.message || "Authentication failed").toString();

        // Clear stale token
        try {
          localStorage.removeItem("user_jwt");
          localStorage.removeItem("user_pubkey");
        } catch {}
        notifyJwtChanged();

        setStatus(msg);
      } finally {
        authInFlightRef.current = false;
        setLoading(false);
      }
    })();
  }, [wallet.connected, wallet.publicKey, wallet.signMessage]);

  const gateLine = (() => {
    if (!gate) return null;

    const price =
      gate.priceUsd !== null && Number.isFinite(gate.priceUsd)
        ? `$${gate.priceUsd.toFixed(6)}`
        : "n/a";

    const reqTokens =
      gate.requiredTokens !== null && Number.isFinite(gate.requiredTokens)
        ? `${gate.requiredTokens.toFixed(4)}`
        : "n/a";

    const reqUsd =
      gate.requiredUsd !== null && Number.isFinite(gate.requiredUsd)
        ? `$${gate.requiredUsd.toFixed(2)}`
        : gate.min_usd !== null
        ? `$${Number(gate.min_usd).toFixed(2)}`
        : "n/a";

    if (!gate.enabled || gate.mode === "none") {
      return { title: "Token gating", body: "Currently disabled." };
    }

    if (gate.mode === "usd") {
      return {
        title: "Token gating (USD)",
        body: `Price: ${price} · Required: ${reqUsd} ≈ ${reqTokens} tokens`,
      };
    }

    return {
      title: "Token gating (Amount)",
      body: `Price: ${price} · Required: ${reqTokens} tokens`,
    };
  })();

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
              alignItems: "start",
            }}
          >
            <div>
              <h1 style={{ margin: 0, fontSize: 34, letterSpacing: -0.5 }}>uTrade Bot Catalog</h1>

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

            <div style={{ display: "grid", gap: 12 }}>
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

              <div className="card" style={{ padding: 18 }}>
                <div style={{ fontWeight: 800 }}>{gateLine?.title || "Token gating"}</div>
                {gateErr ? (
                  <div style={{ marginTop: 8, color: "var(--muted)", lineHeight: 1.5 }}>{gateErr}</div>
                ) : (
                  <div style={{ marginTop: 8, color: "var(--muted)", lineHeight: 1.5 }}>
                    {gateLine?.body || "Loading…"}
                  </div>
                )}
                {gate?.mint_address ? (
                  <div style={{ marginTop: 10, fontSize: 12, color: "var(--muted)" }}>
                    Mint: <code>{gate.mint_address}</code>
                  </div>
                ) : null}
              </div>
            </div>
          </div>
        </div>
      </div>
    </>
  );
}