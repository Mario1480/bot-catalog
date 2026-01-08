import { useEffect, useMemo, useRef, useState } from "react";
import bs58 from "bs58";
import { useWallet } from "@solana/wallet-adapter-react";
import { WalletMultiButton } from "@solana/wallet-adapter-react-ui";

function notifyJwtChanged() {
  try {
    window.dispatchEvent(new Event("user_jwt_changed"));
  } catch {}
}

function getApiBase() {
  return (process.env.NEXT_PUBLIC_API_BASE || "https://api.utrade.vip").replace(/\/$/, "");
}

function ssGet(key: string) {
  try {
    return typeof window !== "undefined" ? window.sessionStorage.getItem(key) : null;
  } catch {
    return null;
  }
}
function ssSet(key: string, val: string) {
  try {
    if (typeof window !== "undefined") window.sessionStorage.setItem(key, val);
  } catch {}
}
function ssRemove(key: string) {
  try {
    if (typeof window !== "undefined") window.sessionStorage.removeItem(key);
  } catch {}
}

export function WalletConnect() {
  const wallet = useWallet();

  const [busy, setBusy] = useState(false);
  const [lastErr, setLastErr] = useState<string>("");

  const pubkey = useMemo(() => {
    try {
      return wallet.publicKey?.toBase58?.() || "";
    } catch {
      return "";
    }
  }, [wallet.publicKey]);

  // guards
  const prevConnectedRef = useRef<boolean>(false);
  const inflightRef = useRef<boolean>(false);
  const lastLoginForPubkeyRef = useRef<string>("");

  const LOCK_TTL_MS = 120_000;
  const lockKey = (pk: string) => `wallet_login_lock:${pk}`;
  const doneKey = (pk: string) => `wallet_login_done:${pk}`;

  // Clear JWT only on a real disconnect transition (connected -> disconnected)
  useEffect(() => {
    if (typeof window === "undefined") return;

    const prev = prevConnectedRef.current;
    const now = !!wallet.connected;
    prevConnectedRef.current = now;

    if (prev && !now) {
      try {
        localStorage.removeItem("user_jwt");
        localStorage.removeItem("user_pubkey");
      } catch {}

      const pk = (() => {
        try {
          return localStorage.getItem("user_pubkey") || "";
        } catch {
          return "";
        }
      })();

      if (pk) {
        ssRemove(lockKey(pk));
        ssRemove(doneKey(pk));
      }

      lastLoginForPubkeyRef.current = "";
      setLastErr("");
      notifyJwtChanged();
    }
  }, [wallet.connected]);

  // Perform login exactly once per connect+pubkey if JWT missing
  useEffect(() => {
    if (typeof window === "undefined") return;

    const connected = !!wallet.connected;
    const canSign = typeof wallet.signMessage === "function";

    if (!connected || !pubkey || !canSign) return;

    // Cross-instance / remount lock: prevents multiple nonce requests that would overwrite the server nonce.
    const nowMs = Date.now();
    const lk = lockKey(pubkey);
    const dk = doneKey(pubkey);

    // If we already completed login for this pubkey in this session, do nothing.
    if (ssGet(dk) === "1") {
      lastLoginForPubkeyRef.current = pubkey;
      return;
    }

    const lockVal = ssGet(lk);
    if (lockVal) {
      const ts = Number(lockVal);
      if (Number.isFinite(ts) && nowMs - ts < LOCK_TTL_MS) {
        // Another instance is already doing login; avoid double-sign and nonce overwrite.
        return;
      }
    }

    // If we already attempted login for this pubkey during this connection, don't re-run.
    if (lastLoginForPubkeyRef.current === pubkey) return;

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

    const storedPubkey = readStoredPubkey();

    // wallet changed -> drop old jwt
    if (storedPubkey && storedPubkey !== pubkey) {
      try {
        localStorage.removeItem("user_jwt");
      } catch {}
    }

    // Always store current pubkey
    try {
      localStorage.setItem("user_pubkey", pubkey);
    } catch {}

    const existingJwt = readJwt();
    if (existingJwt) {
      // already authenticated
      lastLoginForPubkeyRef.current = pubkey;
      setLastErr("");
      notifyJwtChanged();
      return;
    }

    // Avoid parallel/double runs (per-instance) + set cross-instance lock
    if (inflightRef.current) return;
    ssSet(lockKey(pubkey), String(Date.now()));
    inflightRef.current = true;
    lastLoginForPubkeyRef.current = pubkey;

    setBusy(true);
    setLastErr("");

    const api = getApiBase();

    (async () => {
      try {
        // 1) nonce + message
        const nonceRes = await fetch(`${api}/auth/nonce?pubkey=${encodeURIComponent(pubkey)}`, {
          method: "GET",
        });
        const nonceJson = await nonceRes.json().catch(() => ({} as any));
        if (!nonceRes.ok) throw new Error(nonceJson?.error || `Nonce failed (${nonceRes.status})`);

        const message = String(nonceJson?.message || "");
        if (!message) throw new Error("Nonce message missing");

        // 2) sign
        const encoded = new TextEncoder().encode(message);
        const sig = await wallet.signMessage!(encoded);
        const signatureBase58 = bs58.encode(sig);

        // 3) verify
        const verifyRes = await fetch(`${api}/auth/verify`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            pubkey,
            signature: signatureBase58,
            message,
            nonce: nonceJson?.nonce,
          }),
        });

        const verifyJson = await verifyRes.json().catch(() => ({} as any));
        if (!verifyRes.ok) {
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

        ssSet(doneKey(pubkey), "1");
        ssRemove(lockKey(pubkey));

        setLastErr("");
        notifyJwtChanged();
      } catch (e: any) {
        const msg = String(e?.message || "Wallet login failed");
        setLastErr(msg);

        ssRemove(lockKey(pubkey));

        // IMPORTANT: only clear jwt if there isn't one already (prevents wiping a token due to a second effect)
        try {
          const existing = localStorage.getItem("user_jwt") || "";
          if (!existing) localStorage.removeItem("user_jwt");
          localStorage.setItem("user_pubkey", pubkey);
        } catch {}

        notifyJwtChanged();
      } finally {
        inflightRef.current = false;
        setBusy(false);
      }
    })();

    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [wallet.connected, pubkey, wallet.signMessage]);

  return (
    <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 8 }}>
      <WalletMultiButton className="btn btnPrimary" />

      {busy ? (
        <div style={{ fontSize: 12, opacity: 0.8 }}>Signing in…</div>
      ) : lastErr ? (
        <div style={{ fontSize: 12, color: "rgba(255,80,80,.9)", maxWidth: 360, textAlign: "right" }}>
          {lastErr}
        </div>
      ) : null}
    </div>
  );
}
