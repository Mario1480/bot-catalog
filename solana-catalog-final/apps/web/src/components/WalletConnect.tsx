import { useWallet } from "@solana/wallet-adapter-react";
import { WalletModalButton } from "@solana/wallet-adapter-react-ui";
import { useEffect, useState } from "react";

export function WalletConnect() {
  const { publicKey, connected, disconnect } = useWallet();
  const [hasPhantom, setHasPhantom] = useState(false);
  const [err, setErr] = useState("");

  useEffect(() => {
    // English comment: Detect Phantom injection.
    const anyWin = window as any;
    setHasPhantom(!!anyWin?.solana?.isPhantom);
  }, []);

  async function connectPhantomDirect() {
    setErr("");
    try {
      const anyWin = window as any;
      if (!anyWin?.solana?.isPhantom) {
        setErr("Phantom extension not detected in this browser context.");
        return;
      }
      await anyWin.solana.connect(); // should open Phantom popup
    } catch (e: any) {
      setErr(e?.message || "Failed to open Phantom.");
    }
  }

  return (
    <div style={{ display: "flex", gap: 12, alignItems: "center", flexWrap: "wrap" }}>
      {/* Default wallet-adapter modal */}
      <WalletModalButton />

      {/* Direct Phantom fallback */}
      {!connected && (
        <button onClick={connectPhantomDirect} disabled={!hasPhantom}>
          Connect Phantom (direct)
        </button>
      )}

      {connected && (
        <button
          onClick={async () => {
            await disconnect();
            window.dispatchEvent(new Event("wallet-disconnect"));
          }}
        >
          Disconnect
        </button>
      )}

      <span style={{ opacity: 0.8 }}>
        {connected ? `Connected: ${publicKey?.toBase58().slice(0, 4)}…${publicKey?.toBase58().slice(-4)}` : "Not connected"}
      </span>

      {err && <span style={{ color: "crimson" }}>{err}</span>}
    </div>
  );
}