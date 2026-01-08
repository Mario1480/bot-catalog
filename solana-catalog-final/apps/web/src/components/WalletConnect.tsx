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

  const [err, setErr] = useState<string>("");

  // Clear JWT immediately on disconnect
  const prevConnectedRef = useRef<boolean>(false);
  useEffect(() => {
    const prev = prevConnectedRef.current;
    prevConnectedRef.current = connected;

    if (prev && !connected) {
      try {
        localStorage.removeItem("user_jwt");
        localStorage.removeItem("user_pubkey");
      } catch {}
      notifyJwtChanged();
      setErr("");
      lastPubkeyRef.current = "";
    }
  }, [connected]);

  // Sign-in flow: when connected and no valid user_jwt for this wallet, request nonce -> sign -> verify
  useEffect(() => {
    if (!connected) return;
    if (!publicKey) return;

    const pk = publicKey.toBase58();

    // If we already have a jwt for THIS pubkey, don't prompt again
    const stored = readStoredAuth();
    if (stored.jwt && stored.pk === pk) {
      lastPubkeyRef.current = pk;
      setErr("");
      attemptCountRef.current = 0;
      return;
    }

    // If wallet can't sign messages, we can't authenticate
    if (!signMessage) {
      setErr("Wallet cannot sign messages.");
      return;
    }

    // prevent rapid re-attempt loops
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
          method: "GET",
          credentials: "include",
          headers: {
            Accept: "application/json",
          },
          signal: ac.signal,
        });

        const nonceJson = await nonceRes.json().catch(() => ({}));
        if (!nonceRes.ok) throw new Error(nonceJson?.error || `Failed to get nonce (${nonceRes.status})`);

        const message = String(nonceJson?.message || "");
        if (!message) throw new Error("Nonce message missing");

        // 2) sign
        const enc = new TextEncoder();
        const sig = await signMessage(enc.encode(message));
        const signature = u8ToBase64(sig);

        // 3) verify
        const verifyRes = await fetch(`${API}/auth/verify`, {
          method: "POST",
          credentials: "include",
          headers: {
            "Content-Type": "application/json",
            Accept: "application/json",
          },
          body: JSON.stringify({ pubkey: pk, signature, message }),
          signal: ac.signal,
        });

        const verifyJson = await verifyRes.json().catch(() => ({}));
        if (!verifyRes.ok) throw new Error(verifyJson?.error || `Verification failed (${verifyRes.status})`);

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
        // ignore aborts
        if (e?.name === "AbortError") return;

        attemptCountRef.current += 1;

        try {
          localStorage.removeItem("user_jwt");
          localStorage.removeItem("user_pubkey");
        } catch {}

        notifyJwtChanged();

        // If the backend returns 401 due to missing nonce/session, show a helpful hint
        const msg = e?.message || "Wallet sign-in failed";
        setErr(msg);

        // Backoff a bit more after multiple failures
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