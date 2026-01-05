import type { AppProps } from "next/app";
import "@solana/wallet-adapter-react-ui/styles.css";
import { WalletProviderWrapper } from "../lib/wallet";

export default function App({ Component, pageProps }: AppProps) {
  return (
    <WalletProviderWrapper>
      <Component {...pageProps} />
    </WalletProviderWrapper>
  );
}
