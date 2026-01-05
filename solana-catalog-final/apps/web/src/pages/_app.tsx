import type { AppProps } from "next/app";
import { SolanaProviders } from "../lib/wallet";

export default function App({ Component, pageProps }: AppProps) {
  return (
    <SolanaProviders>
      <Component {...pageProps} />
    </SolanaProviders>
  );
}