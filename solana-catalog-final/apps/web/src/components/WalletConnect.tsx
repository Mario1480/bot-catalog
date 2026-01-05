import { useEffect } from "react";
import { useWallet } from "@solana/wallet-adapter-react";
import { WalletMultiButton } from "@solana/wallet-adapter-react-ui";

export function WalletConnect() {
  const { connected, disconnect } = useWallet();

  // Optional: Wenn Wallet disconnected => zurück zur Startseite
  useEffect(() => {
    if (!connected) return;
    // nichts tun, nur damit React re-rendert wenn connected wechselt
  }, [connected]);

  return (
    <div style={{ display: "flex", gap: 12, alignItems: "center", flexWrap: "wrap" }}>
      {/* Offizieller Button: zeigt nach Connect direkt die Adresse */}
      <WalletMultiButton />

      {connected && (
        <button
          onClick={async () => {
            try {
              await disconnect();
            } finally {
              // optional: Gate-Session beenden
              localStorage.removeItem("user_jwt");
              window.location.href = "/";
            }
          }}
          style={{
            padding: "8px 12px",
            borderRadius: 10,
            border: "1px solid rgba(255,255,255,.14)",
            background: "rgba(255,255,255,.04)",
            color: "#fff",
            cursor: "pointer",
          }}
        >
          Disconnect
        </button>
      )}
    </div>
  );
}