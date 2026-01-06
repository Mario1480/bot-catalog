import { useMemo } from "react";
import { useWallet } from "@solana/wallet-adapter-react";
import {
  useWalletModal,
} from "@solana/wallet-adapter-react-ui";

function shortAddr(addr: string) {
  return `${addr.slice(0, 4)}…${addr.slice(-4)}`;
}

export function WalletConnect() {
  const { connected, publicKey, disconnect } = useWallet();
  const { setVisible } = useWalletModal();

  const label = useMemo(() => {
    if (!connected || !publicKey) return "Select Wallet";
    return shortAddr(publicKey.toBase58());
  }, [connected, publicKey]);

  async function handleDisconnect() {
    try {
      localStorage.removeItem("user_jwt");
      localStorage.removeItem("admin_jwt");
    } catch {}

    try {
      if (connected) await disconnect();
    } catch {}

    window.location.href = "/";
  }

  return (
    <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
      <button
        className="btn btnPrimary"
        onClick={() => {
          // If already connected, do nothing (or open modal if you want)
          if (!connected) setVisible(true);
        }}
        style={{ display: "inline-flex", alignItems: "center", gap: 10 }}
      >
        <span>{label}</span>
      </button>

      {connected && (
        <button className="btn" onClick={handleDisconnect}>
          Disconnect
        </button>
      )}
    </div>
  );
}