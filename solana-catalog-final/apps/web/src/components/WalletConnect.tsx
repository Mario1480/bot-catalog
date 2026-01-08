import { useEffect, useRef, useState } from "react";
import { useWallet } from "@solana/wallet-adapter-react";
import { WalletMultiButton } from "@solana/wallet-adapter-react-ui";

function notifyJwtChanged() {
  try {
    window.dispatchEvent(new Event("user_jwt_changed"));
  } catch {}
}

function getApiBase() {
  // gleich wie bei dir sonst auch
  return (process.env.NEXT_PUBLIC_API_BASE || "https://api.utrade.vip").replace(/\/$/, "");
}

function toBase64(u8: Uint8Array) {
  // browser-safe
  let s = "";
  for (let i = 0; i < u8.length; i++) s += String.fromCharCode(u8[i]);
  return btoa(s);
}

export function WalletConnect() {
  const wallet = useWallet();

  const [busy, setBusy] = useState(false);
  const [lastErr, setLastErr] = useState<string>("");

  const prevConnectedRef = useRef<boolean>(false);
  const inflightRef = useRef<boolean>(false);
  const lastPubkeyRef = useRef<string>("");

  // Only clear JWT on a REAL disconnect transition (connected -> disconnected)
  useEffect(() => {
    if (typeof window === "undefined") return;

    const prev = prevConnectedRef.current;
    const now = !!wallet.connected;
    prevConnectedRef.current = now;

    // transition: connected -> disconnected
    if (prev && !now) {
      try {
        localStorage.removeItem("user_jwt");
        localStorage.removeItem("user_pubkey");
      } catch {}
      lastPubkeyRef.current = "";
      notifyJwtChanged();
    }
  }, [wallet.connected]);

  // Perform login (nonce -> signMessage -> verify) when connected and JWT missing/outdated
  useEffect(() => {
    if (typeof window === "undefined") return;

    const pubkey = wallet.publicKey?.toBase58?.() || "";
    const canSign = typeof wallet.signMessage === "function";

    // not ready
    if (!wallet.connected || !pubkey || !canSign) return;

    // avoid duplicate parallel calls (also avoids React strict-mode double effect)
    if (inflightRef.current) return;

    const api = getApiBase();

    const readJwt = () => {
      try {
        return localStorage.getItem("user_jwt") || "";
      } catch {
        return "";
      }
    };
    const readStoredPubkey = () => {
      try {
        return localStorage.getItem("user_pubkey") || "";
      } catch {
        return "";
      }
    };

    const currentJwt = readJwt();
    const storedPubkey = readStoredPubkey();

    // If wallet changed vs stored, wipe old jwt (so we re-login for the new wallet)
    if (storedPubkey && storedPubkey !== pubkey) {
      try {
        localStorage.removeItem("user_jwt");
        localStorage.setItem("user_pubkey", pubkey);
      } catch {}
    }

    // If we already have jwt + same pubkey, do nothing
    if (currentJwt && (storedPubkey === pubkey || !storedPubkey)) {
      // ensure pubkey is stored
      try {
        localStorage.setItem("user_pubkey", pubkey);
      } catch {}
      lastPubkeyRef.current = pubkey;
      return;
    }

    // Start login
    inflightRef.current = true;
    setBusy(true);
    setLastErr("");

    (async () => {
      try {
        // 1) get nonce + message
        const nonceRes = await fetch(`${api}/auth/nonce?pubkey=${encodeURIComponent(pubkey)}`, {
          method: "GET",
        });
        const nonceJson = await nonceRes.json().catch(() => ({} as any));
        if (!nonceRes.ok) {
          throw new Error(nonceJson?.error || `Nonce failed (${nonceRes.status})`);
        }

        const message = String(nonceJson?.message || "");
        if (!message) throw new Error("Nonce message missing");

        // 2) sign message
        const encoded = new TextEncoder().encode(message);
        const sig = await wallet.signMessage!(encoded);

        // 3) verify signature -> get jwt
        const verifyRes = await fetch(`${api}/auth/verify`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            pubkey,
            signature: toBase64(sig),
            message,
          }),
        });

        const verifyJson = await verifyRes.json().catch(() => ({} as any));
        if (!verifyRes.ok) {
          // 403 = token gating denied (wichtige UX)
          const hint =
            verifyRes.status === 403
              ? "Access denied by token gating. Please hold the required amount and try again."
              : "";
          throw new Error((verifyJson?.error || `Verify failed (${verifyRes.status})`) + (hint ? ` — ${hint}` : ""));
        }

        const token = String(verifyJson?.token || "");
        if (!token) throw new Error("Missing token in verify response");

        try {
          localStorage.setItem("user_jwt", token);
          localStorage.setItem("user_pubkey", pubkey);
        } catch {}

        lastPubkeyRef.current = pubkey;
        notifyJwtChanged();
      } catch (e: any) {
        const msg = String(e?.message || "Wallet login failed");
        setLastErr(msg);

        // if login fails, ensure no stale jwt remains
        try {
          localStorage.removeItem("user_jwt");
          localStorage.setItem("user_pubkey", pubkey);
        } catch {}
        notifyJwtChanged();
      } finally {
        inflightRef.current = false;
        setBusy(false);
      }
    })();
  }, [wallet.connected, wallet.publicKey, wallet.signMessage]);

  return (
    <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 8 }}>
      <WalletMultiButton className="btn btnPrimary" />

      {/* Optional: small status text (helps debugging, can remove later) */}
      {busy ? (
        <div style={{ fontSize: 12, opacity: 0.8 }}>Signing in…</div>
      ) : lastErr ? (
        <div style={{ fontSize: 12, color: "rgba(255,80,80,.9)", maxWidth: 320, textAlign: "right" }}>
          {lastErr}
        </div>
      ) : null}
    </div>
  );
}