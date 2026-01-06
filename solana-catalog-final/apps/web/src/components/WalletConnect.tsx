import { useEffect, useMemo, useState } from "react";
import { useWallet } from "@solana/wallet-adapter-react";
import { WalletMultiButton } from "@solana/wallet-adapter-react-ui";

export function WalletConnect() {
  const { connected, publicKey, disconnect } = useWallet();
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  // Forces a full remount when the pubkey changes (helps some setups)
  const btnKey = useMemo(
    () => (publicKey ? publicKey.toBase58() : "disconnected"),
    [publicKey]
  );

  return (
    <div style={{ display: "flex", gap: 12, alignItems: "center", flexWrap: "wrap" }}>
      {/* Render only on client to avoid hydration mismatch */}
      {mounted ? (
        <WalletMultiButton key={btnKey} />
      ) : (
        <button className="btn btnPrimary" disabled style={{ opacity: 0.7 }}>
          Connect
        </button>
      )}

      {connected && (
        <button
          onClick={async () => {
            await disconnect();
            window.location.href = "/";
          }}
          style={{
            padding: "8px 12px",
            borderRadius: 8,
            border: "1px solid rgba(255,255,255,.18)",
            background: "transparent",
            color: "var(--text)",
            cursor: "pointer",
          }}
        >
          Disconnect
        </button>
      )}
    </div>
  );
}