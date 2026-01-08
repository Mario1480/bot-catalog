// apps/web/src/pages/index.tsx
import { useEffect, useState } from "react";
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
  const [hasValidSession, setHasValidSession] = useState(false);

  const [gate, setGate] = useState<GatePreview | null>(null);
  const [gateErr, setGateErr] = useState("");

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

  // If JWT exists, validate and update UI (on mount and on jwt changes)
  useEffect(() => {
    let mounted = true;

    const validateAndUpdate = async () => {
      const token = typeof window !== "undefined" ? localStorage.getItem("user_jwt") : null;
      if (!token) {
        if (mounted) setHasValidSession(false);
        return;
      }

      try {
        setLoading(true);
        setStatus("Access granted. You can open the catalog.");
        await apiFetch("/products", { method: "GET" }, token);
        if (mounted) setHasValidSession(true);
      } catch {
        try {
          localStorage.removeItem("user_jwt");
          localStorage.removeItem("user_pubkey");
        } catch {}
        notifyJwtChanged();
        if (mounted) setHasValidSession(false);
        if (mounted) setStatus("Session expired. Please sign in again.");
      } finally {
        if (mounted) setLoading(false);
      }
    };

    const onJwtChanged = () => {
      void validateAndUpdate();
    };

    void validateAndUpdate();
    if (typeof window !== "undefined") {
      window.addEventListener("user_jwt_changed", onJwtChanged);
    }

    return () => {
      mounted = false;
      if (typeof window !== "undefined") {
        window.removeEventListener("user_jwt_changed", onJwtChanged);
      }
    };
  }, []);

  useEffect(() => {
    if (!wallet.connected) {
      setHasValidSession(false);
      setStatus("Connect your wallet to access the catalog.");
      return;
    }

    if (!wallet.signMessage) {
      setHasValidSession(false);
      setStatus("Your wallet does not support message signing. Please use Phantom.");
      return;
    }

    setStatus("Wallet connected. Please approve the sign-in message.");
  }, [wallet.connected, wallet.signMessage]);

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
              {hasValidSession ? (
                <button
                  className="btn btnPrimary"
                  style={{ marginTop: 12, width: "fit-content" }}
                  onClick={() => {
                    window.location.href = "/catalog";
                  }}
                >
                  Access Bot Catalog
                </button>
              ) : null}
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
                  <li>Open the catalog</li>
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
