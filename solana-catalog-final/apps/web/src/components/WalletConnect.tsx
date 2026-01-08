import { useEffect } from "react";
import { useWallet } from "@solana/wallet-adapter-react";
import { WalletMultiButton } from "@solana/wallet-adapter-react-ui";

function notifyJwtChanged() {
  try {
    window.dispatchEvent(new Event("user_jwt_changed"));
  } catch {}
}

export function WalletConnect() {
  const wallet = useWallet();

  // If wallet disconnects (via Phantom dropdown), immediately clear JWT and refresh UI (Catalog hides content)
  useEffect(() => {
    if (typeof window === "undefined") return;

    if (!wallet.connected) {
      try {
        localStorage.removeItem("user_jwt");
        localStorage.removeItem("user_pubkey");
      } catch {}
      notifyJwtChanged();
    }
  }, [wallet.connected]);

  return <WalletMultiButton className="btn btnPrimary" />;
}