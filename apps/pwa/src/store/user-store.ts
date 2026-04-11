import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';

interface UserProfile {
  id: string;
  fullName: string;
  displayName: string;
  avatarUrl: string;
  walletAddress?: string;
  email?: string;
  totalSentUsd?: number;
}

interface UserState {
  profile: UserProfile | null;
  isLoading: boolean;
  isHydrated: boolean;
  setProfile: (profile: UserProfile | null) => void;
  setLoading: (loading: boolean) => void;
  setHydrated: (hydrated: boolean) => void;
  clear: () => void;
}

export const useUserStore = create<UserState>()(
  persist(
    (set) => ({
      profile: null,
      isLoading: false,
      isHydrated: false,
      setProfile: (profile) => set({ profile, isLoading: false }),
      setLoading: (isLoading) => set({ isLoading }),
      setHydrated: (isHydrated) => set({ isHydrated }),
      clear: () => set({ profile: null, isLoading: false }),
    }),
    {
      name: 'fx-remit-user-storage',
      storage: createJSONStorage(() => localStorage),
      onRehydrateStorage: () => (state) => {
        state?.setHydrated(true);
      },
    }
  )
);
