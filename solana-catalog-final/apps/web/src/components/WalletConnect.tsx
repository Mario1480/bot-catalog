import { useEffect, useRef, useState } from "react";
import { useWallet } from "@solana/wallet-adapter-react";
import { WalletMultiButton } from "@solana/wallet-adapter-react-ui";
import { apiBase } from "../lib/api";

function u8ToBase64(u8: Uint8Array): string {
  // Browser-safe base64 encoding
  let s = "";
  for (let i = 0; i < u8.length; i++) s += String.fromCharCode(u8[i]);
  return typeof window !== "undefined" ? window.btoa(s) : "";
}

function notifyJwtChanged() {
  try {
    window.dispatchEvent(new Event("user_jwt_changed"));
  } catch {}
}

function getLocal(key: string): string {
  try {
    return localStorage.getItem(key) || "";
  } catch {
    return "";
  }
}

function setLocal(key: string, val: string) {
  try {
    localStorage.setItem(key, val);
  } catch {}
}

function removeLocal(key: string) {
  try {
    localStorage.removeItem(key);
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
      removeLocal("user_jwt");
      removeLocal("user_pubkey");
      notifyJwtChanged();
      setErr("");
      lastPubkeyRef.current = "";
    }
  }, [connected]);

  // Sign-in flow: when connected and no user_jwt yet, request nonce -> sign -> verify
  useEffect(() => {
    if (!connected) return;
    if (!publicKey) return;

    const pk = publicKey.toBase58();

    // Prevent repeated prompts if already signed in for this wallet
    const existing = getLocal("user_jwt");
    const existingPk = getLocal("user_pubkey");

    // If we already have a token for THIS wallet, do not re-prompt for signing.
    if (existing && existingPk === pk) {
      lastPubkeyRef.current = pk;
      return;
    }

    // If there is a token but it belongs to a different wallet, clear it.
    if (existing && existingPk && existingPk !== pk) {
      removeLocal("user_jwt");
      removeLocal("user_pubkey");
      notifyJwtChanged();
    }

    // Extra guard: if we already completed sign-in in this session for this pk
    if (lastPubkeyRef.current === pk && getLocal("user_jwt")) return;

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

        setLocal("user_jwt", token);
        setLocal("user_pubkey", pk);
        lastPubkeyRef.current = pk;
        notifyJwtChanged();
      } catch (e: any) {
        // If anything fails, ensure we don't keep a stale token around
        removeLocal("user_jwt");
        removeLocal("user_pubkey");
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