'use client';

import { useQuery } from '@tanstack/react-query';
import { usePrivy } from '@privy-io/react-auth';
import { useUserStore } from '@/store/user-store';
import { useSecurityStore } from '@/store/security-store';
import { getMe } from '@/app/actions/user.actions';


export function UserHydrator() {
  const { user, authenticated, ready } = usePrivy();
  const { setProfile } = useUserStore();

  useQuery({
    queryKey: ['user-profile', user?.id],
    queryFn: async () => {
      if (!user?.id) return null;

      const profile = await getMe(user.id);

      if (profile) {
        const sec = useSecurityStore.getState();
        if (sec.hashedPin && sec.ownerUserId !== null && sec.ownerUserId !== profile.id) {
          sec.clearSecurity();
        } else if (sec.hashedPin && sec.ownerUserId === null) {
          sec.setOwnerUserId(profile.id);
        }
      }

      const privyWallet = user.linkedAccounts?.find((a) => a.type === 'wallet');
      const walletAddress = privyWallet?.type === 'wallet' ? privyWallet.address : undefined;

      setProfile(
        profile
          ? { ...profile, walletAddress: profile.walletAddress || walletAddress }
          : null
      );

      useUserStore.getState().setHydrated(true);

      return profile;
    },
    enabled: ready && authenticated && !!user?.id,
  });

  return null;
}
