import { useMemo } from "react";
import { useWallet } from "@solana/wallet-adapter-react";
import { WalletMultiButton } from "@solana/wallet-adapter-react-ui";

export function WalletConnect() {
  const { connected, publicKey, disconnect } = useWallet();

  // Force rerender when publicKey changes (fixes “needs second click” in some setups)
  const btnKey = useMemo(() => (publicKey ? publicKey.toBase58() : "disconnected"), [publicKey]);

  return (
    <div style={{ display: "flex", gap: 12, alignItems: "center", flexWrap: "wrap" }}>
      <WalletMultiButton key={btnKey} />

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