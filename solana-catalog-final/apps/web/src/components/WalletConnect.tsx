import { useWallet } from "@solana/wallet-adapter-react";
import { WalletModalButton } from "@solana/wallet-adapter-react-ui";

export function WalletConnect() {
  const { connected, publicKey, disconnect } = useWallet();

  return (
    <div style={{ display: "flex", gap: 12, alignItems: "center", flexWrap: "wrap" }}>
      <WalletModalButton />

      {connected && (
        <button
          onClick={async () => {
            await disconnect();
            window.location.href = "/";
          }}
        >
          Disconnect
        </button>
      )}

      <span style={{ opacity: 0.8 }}>
        {connected ? `Connected: ${publicKey?.toBase58().slice(0, 4)}…${publicKey?.toBase58().slice(-4)}` : "Not connected"}
      </span>
    </div>
  );
}