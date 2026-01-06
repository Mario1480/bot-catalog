import { useMemo } from "react";
import { useWallet } from "@solana/wallet-adapter-react";
import { WalletMultiButton } from "@solana/wallet-adapter-react-ui";

export function WalletConnect() {
  const { connected, publicKey, disconnect } = useWallet();

  // helps some setups update the label immediately
  const btnKey = useMemo(
    () => (publicKey ? publicKey.toBase58() : "disconnected"),
    [publicKey]
  );

  async function handleDisconnect() {
    try {
      // ✅ always clear auth first
      localStorage.removeItem("user_jwt");
      localStorage.removeItem("admin_jwt"); // optional, if you use it
    } catch {}

    try {
      if (connected) await disconnect();
    } catch {}

    // ✅ force clean state
    window.location.href = "/";
  }

  return (
    <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
      <WalletMultiButton key={btnKey} />

      {connected && (
        <button
          onClick={handleDisconnect}
          className="btn"
          style={{ padding: "10px 12px" }}
        >
          Disconnect
        </button>
      )}
    </div>
  );
}