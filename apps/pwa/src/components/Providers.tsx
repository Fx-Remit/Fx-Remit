'use client';

import { PrivyProvider } from '@privy-io/react-auth';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { WagmiProvider, createConfig, http, fallback } from 'wagmi';
import { base, celo } from 'wagmi/chains';
import { UserHydrator } from './UserHydrator';
import { AppShield } from './security/AppShield';
import React from 'react';

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 5000, // Consider data fresh for 5 seconds
      refetchOnWindowFocus: false, // Stop spamming API when switching tabs
      retry: 1, // Only retry once before failing
    },
  },
});

const ALCHEMY_KEY = process.env.NEXT_PUBLIC_ALCHEMY_API_KEY;

export const wagmiConfig = createConfig({
  chains: [base, celo],
  transports: {
    [base.id]: fallback([
      http(`https://base-mainnet.g.alchemy.com/v2/${ALCHEMY_KEY}`),
      http(),
    ]),
    [celo.id]: fallback([
      http(`https://celo-mainnet.g.alchemy.com/v2/${ALCHEMY_KEY}`),
      http(),
    ]),
  },
});

export function Providers({ children }: { children: React.ReactNode }) {


  return (
    <PrivyProvider
      appId={process.env.NEXT_PUBLIC_PRIVY_APP_ID || ''}
      config={{

        defaultChain: base,
        supportedChains: [base, celo],
        appearance: {
          theme: 'light',
          accentColor: '#2261FE',
          logo: '/fx remit.svg',
        },
        embeddedWallets: {
          showWalletUIs: true,
          ethereum: {
            createOnLogin: 'users-without-wallets',
          },
        },
      }}
    >
      <WagmiProvider config={wagmiConfig}>
        <QueryClientProvider client={queryClient}>
          <AppShield />
          <UserHydrator />
          {children}
        </QueryClientProvider>
      </WagmiProvider>
    </PrivyProvider>
  );
}
