import { useWallet } from "@solana/wallet-adapter-react";
import { WalletConnect } from "../components/WalletConnect";
import { apiFetch } from "../lib/api";
import { useEffect, useState } from "react";
import bs58 from "bs58";

export default function Home() {
  const wallet = useWallet();
  const [status, setStatus] = useState<string>("Connect your wallet to access the catalog.");
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    (async () => {
      if (!wallet.publicKey || !wallet.signMessage) return;

      try {
        setLoading(true);
        setStatus("Requesting nonce...");
        const pubkey = wallet.publicKey.toBase58();
        const { message } = await apiFetch(`/auth/nonce?pubkey=${pubkey}`, { method: "GET" });

        setStatus("Signing message...");
        const sig = await wallet.signMessage(new TextEncoder().encode(message));
        const signatureBase58 = bs58.encode(sig);

        setStatus("Verifying...");
        const out = await apiFetch(`/auth/verify`, {
          method: "POST",
          body: JSON.stringify({ pubkey, signature: signatureBase58, message })
        });

        localStorage.setItem("user_jwt", out.token);
        setStatus("Access granted. Redirecting...");
        window.location.href = "/catalog";
      } catch (e: any) {
        setStatus(e.message || "Auth failed");
      } finally {
        setLoading(false);
      }
    })();
  }, [wallet.publicKey, wallet.signMessage]);

  return (
    <div style={{ maxWidth: 720, margin: "40px auto", padding: 16, fontFamily: "system-ui" }}>
      <h1>Solana Token-Gated Catalog</h1>
      <WalletConnect />
      <p style={{ marginTop: 16 }}>{loading ? "Working..." : status}</p>

      <p style={{ opacity: 0.7 }}>
        Admin area: <a href="/admin/login">/admin/login</a>
      </p>
    </div>
  );
}