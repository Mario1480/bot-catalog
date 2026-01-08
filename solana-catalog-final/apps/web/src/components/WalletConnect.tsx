import { useEffect, useRef } from "react";
import { useWallet } from "@solana/wallet-adapter-react";
import { WalletMultiButton } from "@solana/wallet-adapter-react-ui";

export function WalletConnect() {
  const { connected } = useWallet();

  // Track previous connection state
  const prevConnectedRef = useRef<boolean>(false);

  useEffect(() => {
    const prev = prevConnectedRef.current;
    prevConnectedRef.current = connected;

    // Handle disconnect (from dropdown or anywhere)
    if (prev && !connected) {
      try {
        localStorage.removeItem("user_jwt");
      } catch {}
    }
  }, [connected]);

  return (
    <div style={{ display: "flex", alignItems: "center" }}>
      {/* Single source of truth for wallet UX */}
      <WalletMultiButton />
    </div>
  );
}