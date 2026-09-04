import { create } from "zustand";
import { persist, createJSONStorage } from "zustand/middleware";

/** Default Auto-Lock interval: how long the app may sit backgrounded or idle before requiring re-verification. */
export const DEFAULT_AUTO_LOCK_MS = 5 * 60_000;

interface SecurityState {
  isLocked: boolean;
  isBiometricEnabled: boolean;
  isSecurityEnabled: boolean;
  hashedPin: string | null;
  pinSalt: string | null;
  biometricCredentialId: string | null;
  failedAttempts: number;
  isHydrated: boolean; // Tracks if localStorage has finished loading
  /** Epoch ms of the last successful PIN/biometric verification. */
  lastUnlockedAt: number | null;
  /** Epoch ms the tab last went hidden; persisted so it survives the process being killed. */
  hiddenAt: number | null;
  /** One-shot intent: a re-auth prompt is being shown to confirm disabling App Lock. */
  pendingAction: 'disableSecurity' | null;
  /** The internal user id the current PIN/biometric setup belongs to, so a different account logging in on the same device doesn't inherit it. */
  ownerUserId: string | null;
  /** How long the app may sit backgrounded or idle before requiring re-verification. User-configurable. */
  autoLockMs: number;

  // Actions
  setHydrated: (state: boolean) => void;
  setLocked: (locked: boolean) => void;
  setBiometricEnabled: (enabled: boolean) => void;
  setBiometricCredentialId: (id: string | null) => void;
  setSecurityEnabled: (enabled: boolean) => void;
  setPin: (pin: string | null, salt: string | null, ownerUserId: string | null) => void; // Expects hashed pin
  setOwnerUserId: (id: string | null) => void;
  incrementFailedAttempts: () => void;
  resetFailedAttempts: () => void;
  setLastUnlockedAt: (timestamp: number | null) => void;
  setHiddenAt: (timestamp: number | null) => void;
  /**
   * Decides whether the app should be locked, based on persisted timestamps
   * rather than an in-memory timer. Safe to call fresh on every mount/
   * hydration and every visibility-restore, and survives the process having
   * been killed while backgrounded. Only ever locks, never unlocks.
   */
  evaluateLockState: () => void;
  setPendingAction: (action: 'disableSecurity' | null) => void;
  setAutoLockMs: (ms: number) => void;
  clearSecurity: () => void;
}

export const useSecurityStore = create<SecurityState>()(
  persist(
    (set, get) => ({
      isLocked: false,
      isBiometricEnabled: false,
      isSecurityEnabled: false,
      hashedPin: null,
      pinSalt: null,
      biometricCredentialId: null,
      failedAttempts: 0,
      isHydrated: false,
      lastUnlockedAt: null,
      hiddenAt: null,
      pendingAction: null,
      ownerUserId: null,
      autoLockMs: DEFAULT_AUTO_LOCK_MS,

      setHydrated: (isHydrated) => set({ isHydrated }),
      setLocked: (isLocked) => set({ isLocked }),
      setBiometricEnabled: (isBiometricEnabled) => set({ isBiometricEnabled }),
      setBiometricCredentialId: (biometricCredentialId) => set({ biometricCredentialId }),
      setSecurityEnabled: (isSecurityEnabled) => set({ isSecurityEnabled }),
      setPin: (hashedPin, pinSalt, ownerUserId) =>
        set({ hashedPin, pinSalt, ownerUserId, isSecurityEnabled: !!hashedPin, failedAttempts: 0 }),
      setOwnerUserId: (ownerUserId) => set({ ownerUserId }),

      incrementFailedAttempts: () =>
        set((state) => ({
          failedAttempts: state.failedAttempts + 1,
        })),

      resetFailedAttempts: () => set({ failedAttempts: 0 }),

      setLastUnlockedAt: (lastUnlockedAt) => set({ lastUnlockedAt }),
      setHiddenAt: (hiddenAt) => set({ hiddenAt }),

      evaluateLockState: () => {
        const { isSecurityEnabled, lastUnlockedAt, hiddenAt } = get();
        if (!isSecurityEnabled) return;
        const neverUnlocked = lastUnlockedAt == null;
        const expiredWhileHidden = hiddenAt != null && Date.now() - hiddenAt > get().autoLockMs;
        if (neverUnlocked || expiredWhileHidden) {
          set({ isLocked: true, hiddenAt: null });
        } else {
          set({ hiddenAt: null });
        }
      },

      setPendingAction: (pendingAction) => set({ pendingAction }),
      setAutoLockMs: (autoLockMs) => set({ autoLockMs }),

      clearSecurity: () =>
        set({
          isSecurityEnabled: false,
          isBiometricEnabled: false,
          hashedPin: null,
          pinSalt: null,
          biometricCredentialId: null,
          failedAttempts: 0,
          isLocked: false,
          lastUnlockedAt: null,
          hiddenAt: null,
          pendingAction: null,
          ownerUserId: null,
        }),
    }),
    {
      name: "fx-remit-security-storage",
      storage: createJSONStorage(() => localStorage),
      onRehydrateStorage: () => (state) => {
        if (state) {
          state.setHydrated(true);
          state.setPendingAction(null);
          state.evaluateLockState();
        }
      },
    },
  ),
);
