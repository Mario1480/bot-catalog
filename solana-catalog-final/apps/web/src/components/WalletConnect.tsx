import { useEffect, useRef, useState } from "react";
import { useWallet } from "@solana/wallet-adapter-react";
import { WalletMultiButton } from "@solana/wallet-adapter-react-ui";
import { apiBase } from "../lib/api";

function u8ToBase64(u8: Uint8Array): string {
  let s = "";
  for (let i = 0; i < u8.length; i++) s += String.fromCharCode(u8[i]);
  return typeof window !== "undefined" ? window.btoa(s) : "";
}

function notifyJwtChanged() {
  try {
    window.dispatchEvent(new Event("user_jwt_changed"));
  } catch {}
}

export function WalletConnect() {
  const { connected, publicKey, signMessage } = useWallet();

  const signingRef = useRef(false);
  const lastPubkeyRef = useRef<string>("");

  const lastAttemptAtRef = useRef<number>(0);
  const attemptCountRef = useRef<number>(0);

  const [err, setErr] = useState<string>("");

  function readStoredAuth() {
    try {
      return {
        jwt: localStorage.getItem("user_jwt") || "",
        pk: localStorage.getItem("user_pubkey") || "",
      };
    } catch {
      return { jwt: "", pk: "" };
    }
  }

  // Handle disconnect: clear auth but DO NOT redirect
  const prevConnectedRef = useRef<boolean>(false);
  useEffect(() => {
    const prev = prevConnectedRef.current;
    prevConnectedRef.current = connected;

    if (prev && !connected) {
      try {
        localStorage.removeItem("user_jwt");
        localStorage.removeItem("user_pubkey");
      } catch {}
      lastPubkeyRef.current = "";
      notifyJwtChanged();
      setErr("");
    }
  }, [connected]);

  // Sign-in flow
  useEffect(() => {
    if (!connected) return;
    if (!publicKey) return;

    const pk = publicKey.toBase58();
    const stored = readStoredAuth();

    // Already authenticated for this wallet → nothing to do
    if (stored.jwt && stored.pk === pk) {
      lastPubkeyRef.current = pk;
      setErr("");
      attemptCountRef.current = 0;
      return;
    }

    if (!signMessage) {
      setErr("Wallet cannot sign messages.");
      return;
    }

    const now = Date.now();
    if (now - lastAttemptAtRef.current < 3000) return;
    if (signingRef.current) return;

    signingRef.current = true;
    lastAttemptAtRef.current = now;

    const ac = new AbortController();

    (async () => {
      try {
        setErr("");
        const API = apiBase();

        // 1) nonce
        const nonceRes = await fetch(`${API}/auth/nonce?pubkey=${encodeURIComponent(pk)}`, {
          headers: { Accept: "application/json" },
          signal: ac.signal,
        });

        const nonceJson = await nonceRes.json().catch(() => ({}));
        if (!nonceRes.ok) throw new Error(nonceJson?.error || "Failed to get nonce");

        const message = String(nonceJson?.message || "");
        if (!message) throw new Error("Nonce message missing");

        // 2) sign
        const enc = new TextEncoder();
        const sig = await signMessage(enc.encode(message));
        const signature = u8ToBase64(sig);

        // 3) verify
        const verifyRes = await fetch(`${API}/auth/verify`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Accept: "application/json",
          },
          body: JSON.stringify({ pubkey: pk, signature, message }),
          signal: ac.signal,
        });

        const verifyJson = await verifyRes.json().catch(() => ({}));
        if (!verifyRes.ok) throw new Error(verifyJson?.error || "Verification failed");

        const token = String(verifyJson?.token || "");
        if (!token) throw new Error("Missing token");

        try {
          localStorage.setItem("user_jwt", token);
          localStorage.setItem("user_pubkey", pk);
        } catch {}

        lastPubkeyRef.current = pk;
        attemptCountRef.current = 0;
        notifyJwtChanged();
      } catch (e: any) {
        if (e?.name === "AbortError") return;

        attemptCountRef.current += 1;

        try {
          localStorage.removeItem("user_jwt");
          localStorage.removeItem("user_pubkey");
        } catch {}

        notifyJwtChanged();
        setErr(e?.message || "Wallet sign-in failed");

        if (attemptCountRef.current >= 3) {
          lastAttemptAtRef.current = Date.now() + 10000;
        }
      } finally {
        signingRef.current = false;
      }
    })();

    return () => {
      try {
        ac.abort();
      } catch {}
    };
  }, [connected, publicKey, signMessage]);

  return (
    <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
      <WalletMultiButton />
      {err ? (
        <span style={{ fontSize: 12, opacity: 0.8 }} title={err}>
          ⚠️
        </span>
      ) : null}
    </div>
  );
}