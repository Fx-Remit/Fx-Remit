'use client';

import { useEffect } from 'react';
import { usePrivy } from '@privy-io/react-auth';
import { useUserStore } from '@/store/user-store';
import { getMe } from '@/app/actions/user.actions';

export function UserHydrator() {
  const { user, authenticated, ready } = usePrivy();
  const { setProfile, setLoading } = useUserStore();

  useEffect(() => {
    async function syncProfile() {
      if (ready && authenticated && user?.id) {
        setLoading(true);
        try {
          const profile = await getMe(user.id);
          if (profile) {
            const privyWallet = user.linkedAccounts?.find((a) => a.type === 'wallet');
            const walletAddress = privyWallet?.type === 'wallet' ? privyWallet.address : undefined;

            setProfile({
              ...profile,
              walletAddress: profile.walletAddress || walletAddress
            });
          }
        } catch (error) {
          console.error('Failed to hydrate user profile:', error);
        } finally {
          setLoading(false);
        }
      } else if (ready && !authenticated) {
        // Clear store if logged out
        setProfile(null);
      }
    }

    syncProfile();
  }, [ready, authenticated, user?.id, setProfile, setLoading]);

  return null; // This component handles side effects only
}
