import { create } from "zustand";
import { persist, createJSONStorage } from "zustand/middleware";

interface SecurityState {
  isLocked: boolean;
  isBiometricEnabled: boolean;
  isSecurityEnabled: boolean;
  hashedPin: string | null;
  pinSalt: string | null;
  biometricCredentialId: string | null;
  failedAttempts: number;
  isHydrated: boolean; // Tracks if localStorage has finished loading

  // Actions
  setHydrated: (state: boolean) => void;
  setLocked: (locked: boolean) => void;
  setBiometricEnabled: (enabled: boolean) => void;
  setBiometricCredentialId: (id: string | null) => void;
  setSecurityEnabled: (enabled: boolean) => void;
  setPin: (pin: string | null, salt: string | null) => void; // Expects hashed pin
  incrementFailedAttempts: () => void;
  resetFailedAttempts: () => void;
  clearSecurity: () => void;
}

export const useSecurityStore = create<SecurityState>()(
  persist(
    (set) => ({
      isLocked: false,
      isBiometricEnabled: false,
      isSecurityEnabled: false,
      hashedPin: null,
      pinSalt: null,
      biometricCredentialId: null,
      failedAttempts: 0,
      isHydrated: false,

      setHydrated: (isHydrated) => set({ isHydrated }),
      setLocked: (isLocked) => set({ isLocked }),
      setBiometricEnabled: (isBiometricEnabled) => set({ isBiometricEnabled }),
      setBiometricCredentialId: (biometricCredentialId) => set({ biometricCredentialId }),
      setSecurityEnabled: (isSecurityEnabled) => set({ isSecurityEnabled }),
      setPin: (hashedPin, pinSalt) =>
        set({ hashedPin, pinSalt, isSecurityEnabled: !!hashedPin, failedAttempts: 0 }),

      incrementFailedAttempts: () =>
        set((state) => ({
          failedAttempts: state.failedAttempts + 1,
        })),

      resetFailedAttempts: () => set({ failedAttempts: 0 }),

      clearSecurity: () =>
        set({
          isSecurityEnabled: false,
          isBiometricEnabled: false,
          hashedPin: null,
          pinSalt: null,
          biometricCredentialId: null,
          failedAttempts: 0,
          isLocked: false,
        }),
    }),
    {
      name: "fx-remit-security-storage",
      storage: createJSONStorage(() => localStorage),
      onRehydrateStorage: () => (state) => {
        if (state) state.setHydrated(true);
      },
    },
  ),
);
