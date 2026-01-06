import { useMemo } from "react";
import { useWallet } from "@solana/wallet-adapter-react";
import { WalletMultiButton } from "@solana/wallet-adapter-react-ui";

function shortAddr(addr: string) {
  return `${addr.slice(0, 4)}…${addr.slice(-4)}`;
}

export function WalletConnect() {
  const { connected, publicKey, disconnect } = useWallet();

  // English comment: Derive label from publicKey so it updates immediately after connect.
  const addressLabel = useMemo(() => {
    if (!publicKey) return "";
    return shortAddr(publicKey.toBase58());
  }, [publicKey]);

  async function handleDisconnect() {
    try {
      localStorage.removeItem("user_jwt");
    } catch {}

    try {
      await disconnect();
    } catch {}

    window.location.href = "/";
  }

  return (
    <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
      {/* Keep the official button to ensure Phantom opens reliably */}
      <WalletMultiButton />

      {/* Show address immediately (independent from WalletMultiButton internal label updates) */}
      {connected && addressLabel && (
        <div
          className="badge"
          style={{
            display: "inline-flex",
            alignItems: "center",
            gap: 8,
            padding: "8px 10px",
          }}
          title={publicKey?.toBase58()}
        >
          <span className="badgeDot" style={{ background: "var(--brand)" }} />
          {addressLabel}
        </div>
      )}

      {connected && (
        <button className="btn" onClick={handleDisconnect}>
          Disconnect
        </button>
      )}
    </div>
  );
}