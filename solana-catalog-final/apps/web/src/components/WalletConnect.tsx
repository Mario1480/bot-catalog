import { useWallet } from "@solana/wallet-adapter-react";
import { WalletMultiButton } from "@solana/wallet-adapter-react-ui";

export function WalletConnect() {
  const { connected, publicKey, disconnect } = useWallet();

  return (
    <div style={{ display: "flex", gap: 12, alignItems: "center", flexWrap: "wrap" }}>
      <WalletMultiButton />

      {connected && (
        <button
          onClick={async () => {
            await disconnect();
            localStorage.removeItem("user_jwt");
            window.location.href = "/";
          }}
          style={{
            padding: "8px 12px",
            borderRadius: 6,
            border: "1px solid #444",
            background: "transparent",
            color: "inherit",
            cursor: "pointer",
          }}
        >
          Disconnect
        </button>
      )}

      <span style={{ opacity: 0.8 }}>
        {connected
          ? `Connected: ${publicKey?.toBase58().slice(0, 4)}…${publicKey?.toBase58().slice(-4)}`
          : "Not connected"}
      </span>
    </div>
  );
}