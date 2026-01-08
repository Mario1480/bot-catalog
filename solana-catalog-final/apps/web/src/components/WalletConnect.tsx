import dynamic from "next/dynamic";
import { useWallet } from "@solana/wallet-adapter-react";

const WalletMultiButtonDynamic = dynamic(
  async () => (await import("@solana/wallet-adapter-react-ui")).WalletMultiButton,
  { ssr: false }
);

function notifyJwtChanged() {
  try {
    window.dispatchEvent(new Event("user_jwt_changed"));
  } catch {}
}

export function WalletConnect() {
  const { connected, publicKey, disconnect } = useWallet();

  async function onDisconnect() {
    try {
      await disconnect();
    } finally {
      try {
        localStorage.removeItem("user_jwt");
        localStorage.removeItem("user_pubkey");
      } catch {}
      notifyJwtChanged();
    }
  }

  return (
    <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
      <WalletMultiButtonDynamic className="btn btnPrimary" />

      {connected && publicKey ? (
        <button className="btn" onClick={onDisconnect}>
          Disconnect
        </button>
      ) : null}
    </div>
  );
}