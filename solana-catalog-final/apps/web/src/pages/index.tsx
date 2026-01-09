// apps/web/src/pages/index.tsx
import { useEffect, useState } from "react";
import { useRouter } from "next/router";
import { useWallet } from "@solana/wallet-adapter-react";
import { AppHeader } from "../components/AppHeader";
import { AppFooter } from "../components/AppFooter";
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
  const router = useRouter();

  const [status, setStatus] = useState("Connect your wallet to access the catalog.");
  const [loading, setLoading] = useState(false);
  const [hasValidSession, setHasValidSession] = useState(false);
  const [gateStatus, setGateStatus] = useState<any | null>(null);

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

  const readGateStatus = () => {
    try {
      const raw = localStorage.getItem("user_gate_status");
      if (!raw) return null;
      const parsed = JSON.parse(raw);
      return parsed && typeof parsed === "object" ? parsed : null;
    } catch {
      return null;
    }
  };

  const fmtToken = (n: number) => {
    if (!Number.isFinite(n)) return "-";
    return new Intl.NumberFormat(undefined, { maximumFractionDigits: 6 }).format(n);
  };
  const fmtUsd = (n: number) => {
    if (!Number.isFinite(n)) return "-";
    return new Intl.NumberFormat(undefined, { style: "currency", currency: "USD" }).format(n);
  };

  const gateStatusMessage = (gs: any) => {
    const reason = String(gs?.reason || "");
    if (reason === "Insufficient token amount") {
      const bal = Number(gs?.balance ?? NaN);
      if (Number.isFinite(bal) && bal <= 0) return "Required token not found in wallet.";
      return "Token amount is too low.";
    }
    if (reason === "Insufficient USD value") return "Token value in USD is too low.";
    if (reason === "Gate mint not configured") return "Access gate not configured. Please contact support.";
    if (reason === "Gate thresholds not configured") return "Access gate not configured. Please contact support.";
    return reason || "Access denied.";
  };

  const gateInfo = (() => {
    if (!gateStatus) return null;
    const balance = Number(gateStatus?.balance ?? NaN);
    const usdValue = Number(gateStatus?.usdValue ?? NaN);
    const requiredTokens = Number(gate?.requiredTokens ?? NaN);
    const requiredUsd = Number((gate as any)?.requiredUsd ?? (gate as any)?.min_usd ?? NaN);

    const remainingTokens = Number.isFinite(balance) && Number.isFinite(requiredTokens)
      ? Math.max(0, requiredTokens - balance)
      : NaN;
    const remainingUsd = Number.isFinite(usdValue) && Number.isFinite(requiredUsd)
      ? Math.max(0, requiredUsd - usdValue)
      : NaN;

    return {
      balance,
      usdValue,
      requiredTokens,
      requiredUsd,
      remainingTokens,
      remainingUsd,
      reason: String(gateStatus?.reason || ""),
      mode: gate?.mode || "none",
    };
  })();

  // If JWT exists, validate and update UI (on mount and on jwt changes)
  useEffect(() => {
    let mounted = true;

    const validateAndUpdate = async () => {
      const gs = readGateStatus();
      if (mounted) setGateStatus(gs);

      const token = typeof window !== "undefined" ? localStorage.getItem("user_jwt") : null;
      if (!token) {
        if (mounted) setHasValidSession(false);
        if (gs && mounted) setStatus(gateStatusMessage(gs));
        return;
      }

      try {
        setLoading(true);
        setStatus("Approved. You can open the catalog.");
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

    if (gateStatus) return;
    setStatus("Wallet connected. Please approve the sign-in message.");
  }, [wallet.connected, wallet.signMessage, gateStatus]);

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
        price,
        reqTokens,
        reqUsd,
      };
    }

    return {
      title: "Token gating (Amount)",
      price,
      reqTokens,
      reqUsd,
    };
  })();

  return (
    <>
      <AppHeader />

      <div className="container">
        <div className="card" style={{ padding: 22 }}>
          <div className="homeGrid">
            <div>
              <h1 style={{ margin: 0, fontSize: 34, letterSpacing: -0.5 }}>uTrade Bot Catalog</h1>

              <p style={{ marginTop: 10, color: "var(--muted)", lineHeight: 1.5 }}>
                Beta v0.1
              </p>

              <div style={{ marginTop: 16, display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
                <div className="badge">
                  <span
                    className="badgeDot"
                    style={{
                      background: loading ? "var(--brand)" : "rgba(232,238,247,.35)",
                    }}
                  />
                  {loading ? "Working…" : status}
                </div>
                <button
                  className={`btn btnPrimary ${hasValidSession ? "" : "btnDisabled"}`}
                  disabled={!hasValidSession}
                  onClick={() => {
                    if (!hasValidSession) return;
                    void router.push("/catalog");
                  }}
                >
                  {hasValidSession ? "Access Bot Catalog" : "No Access"}
                </button>
              </div>

              {gateInfo ? (
                <div
                  className="card"
                  style={{
                    marginTop: 14,
                    padding: 14,
                    borderColor: "rgba(255,193,7,.35)",
                    background: "rgba(255,193,7,.06)",
                  }}
                >
                  <div style={{ fontWeight: 800, marginBottom: 8 }}>Wallet info</div>
                  <div style={{ display: "grid", gap: 6, fontSize: 13 }}>
                    <div style={{ display: "flex", justifyContent: "space-between", gap: 10 }}>
                      <span style={{ color: "var(--muted)" }}>Token balance (UTT)</span>
                      <span>{fmtToken(gateInfo.balance)}</span>
                    </div>
                    <div style={{ display: "flex", justifyContent: "space-between", gap: 10 }}>
                      <span style={{ color: "var(--muted)" }}>USD value</span>
                      <span>{fmtUsd(gateInfo.usdValue)}</span>
                    </div>
                    {gateInfo.reason === "Insufficient token amount" && Number.isFinite(gateInfo.remainingTokens) ? (
                      <div style={{ display: "flex", justifyContent: "space-between", gap: 10 }}>
                        <span style={{ color: "var(--muted)" }}>Missing tokens (UTT)</span>
                        <span>{fmtToken(gateInfo.remainingTokens)}</span>
                      </div>
                    ) : null}

                    {gateInfo.reason === "Insufficient USD value" && Number.isFinite(gateInfo.remainingUsd) ? (
                      <div style={{ display: "flex", justifyContent: "space-between", gap: 10 }}>
                        <span style={{ color: "var(--muted)" }}>Missing USD</span>
                        <span>{fmtUsd(gateInfo.remainingUsd)}</span>
                      </div>
                    ) : null}
                  </div>
                </div>
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
                  <div style={{ marginTop: 8, display: "grid", gap: 6, color: "var(--muted)", lineHeight: 1.5 }}>
                    <div>
                      <b style={{ color: "var(--text)" }}>Price:</b> {gateLine?.price || "Loading…"}
                    </div>
                    <div>
                      <b style={{ color: "var(--text)" }}>Required tokens:</b> {gateLine?.reqTokens || "Loading…"} UTT
                    </div>
                    <div>
                      <b style={{ color: "var(--text)" }}>Required USD:</b> {gateLine?.reqUsd || "Loading…"}
                    </div>
                  </div>
                )}
                {gate?.mint_address ? (
                  <div style={{ marginTop: 10, fontSize: 12, color: "var(--muted)" }}>
                    UTT Address: <code>{gate.mint_address}</code>
                  </div>
                ) : null}
              </div>
            </div>
          </div>
        </div>
      </div>

      <AppFooter />
    </>
  );
}
