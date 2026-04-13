'use client';

import { useEffect } from 'react';
import { useQuery } from '@tanstack/react-query';
import { usePrivy } from '@privy-io/react-auth';
import { useUserStore } from '@/store/user-store';
import { getMe } from '@/app/actions/user.actions';

export function UserHydrator() {
  const { user, authenticated, ready } = usePrivy();
  const { setProfile, setLoading } = useUserStore();

  // Background sync service using TanStack Query
  const { data: profile } = useQuery({
    queryKey: ['user-profile', user?.id],
    queryFn: () => (user?.id ? getMe(user?.id) : null),
    enabled: ready && authenticated && !!user?.id,
    refetchInterval: 10000, // Background heartbeat every 10s
    refetchOnWindowFocus: true,
  });

  useEffect(() => {
    if (profile) {
      const privyWallet = user?.linkedAccounts?.find((a) => a.type === 'wallet');
      const walletAddress = privyWallet?.type === 'wallet' ? privyWallet.address : undefined;

      setProfile({
        ...profile,
        walletAddress: profile.walletAddress || walletAddress
      });
    } else if (ready && !authenticated) {
      setProfile(null);
    }
  }, [profile, user, ready, authenticated, setProfile]);

  return null; // This component handles side effects only
}
