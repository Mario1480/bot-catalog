import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/router";
import { useWallet } from "@solana/wallet-adapter-react";
import { WalletModalButton } from "@solana/wallet-adapter-react-ui";

// English comment: Small status chip UI for wallet connection.
function StatusChip({ connected, text }: { connected: boolean; text: string }) {
  return (
    <span className="badge" title={text}>
      <span className="badgeDot" style={{ background: connected ? "var(--brand)" : "rgba(232,238,247,.35)" }} />
      {text}
    </span>
  );
}

export function WalletConnect() {
  const router = useRouter();
  const wallet = useWallet();
  const [lastPublicKey, setLastPublicKey] = useState<string>("");

  const connected = !!wallet.connected && !!wallet.publicKey;
  const short = useMemo(() => {
    const pk = wallet.publicKey?.toBase58() || "";
    if (!pk) return "";
    return `${pk.slice(0, 4)}…${pk.slice(-4)}`;
  }, [wallet.publicKey]);

  useEffect(() => {
    // English comment: When user disconnects, clear auth + return to home.
    if (!connected && lastPublicKey) {
      localStorage.removeItem("user_jwt");
      router.push("/");
    }
    if (connected && wallet.publicKey) setLastPublicKey(wallet.publicKey.toBase58());
  }, [connected, wallet.publicKey, lastPublicKey, router]);

  return (
    <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
      <WalletModalButton className="btn btnPrimary" />

      {connected ? (
        <>
          <StatusChip connected={true} text={`Connected: ${short}`} />
          <button
            className="btn"
            onClick={async () => {
              await wallet.disconnect();
              // English comment: router redirect handled by effect.
            }}
          >
            Disconnect
          </button>
        </>
      ) : (
        <StatusChip connected={false} text="Not connected" />
      )}
    </div>
  );
}