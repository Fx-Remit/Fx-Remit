'use client';

import { PrivyProvider } from '@privy-io/react-auth';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { WagmiProvider, createConfig, http, fallback } from 'wagmi';
import { base, celo, arbitrum } from 'wagmi/chains';
import { UserHydrator } from './UserHydrator';

const queryClient = new QueryClient();

const ALCHEMY_KEY = process.env.NEXT_PUBLIC_ALCHEMY_API_KEY;

export const wagmiConfig = createConfig({
  chains: [base, celo, arbitrum],
  transports: {
    [base.id]: fallback([
      http(`https://base-mainnet.g.alchemy.com/v2/${ALCHEMY_KEY}`),
      http(),
    ]),
    [celo.id]: fallback([
      http(`https://celo-mainnet.g.alchemy.com/v2/${ALCHEMY_KEY}`),
      http(),
    ]),
    [arbitrum.id]: fallback([
      http(`https://arb-mainnet.g.alchemy.com/v2/${ALCHEMY_KEY}`),
      http(),
    ]),
  },
});

export function Providers({ children }: { children: React.ReactNode }) {
  return (
    <PrivyProvider
      appId={process.env.NEXT_PUBLIC_PRIVY_APP_ID || ''}
      config={{
        appearance: {
          theme: 'light',
          accentColor: '#2261FE',
          logo: '/fx remit.svg',
        },
        embeddedWallets: {
          createOnLogin: 'users-without-wallets',
        },
      }}
    >
      <WagmiProvider config={wagmiConfig}>
        <QueryClientProvider client={queryClient}>
          <UserHydrator />
          {children}
        </QueryClientProvider>
      </WagmiProvider>
    </PrivyProvider>
  );
}
