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
    let existingJwt = "";
    let existingPk = "";
    try {
      existingJwt = localStorage.getItem("user_jwt") || "";
      existingPk = localStorage.getItem("user_pubkey") || "";
    } catch {}

    if (existingJwt && existingPk === pk) {
      lastPubkeyRef.current = pk;
      setErr("");
      return;
    }

    // If wallet can't sign messages, we can't authenticate
    if (!signMessage) {
      setErr("Wallet cannot sign messages.");
      return;
    }

    if (signingRef.current) return;
    signingRef.current = true;

    (async () => {
      try {
        setErr("");
        const API = apiBase();

        // 1) nonce
        const nonceRes = await fetch(`${API}/auth/nonce?pubkey=${encodeURIComponent(pk)}`);
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
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ pubkey: pk, signature, message }),
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
        notifyJwtChanged();
      } catch (e: any) {
        try {
          localStorage.removeItem("user_jwt");
          localStorage.removeItem("user_pubkey");
        } catch {}
        notifyJwtChanged();
        setErr(e?.message || "Wallet sign-in failed");
      } finally {
        signingRef.current = false;
      }
    })();
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