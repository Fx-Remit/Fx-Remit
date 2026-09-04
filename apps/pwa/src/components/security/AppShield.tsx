'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { useSecurityStore } from '@/store/security-store';
import { useUserStore } from '@/store/user-store';
import { usePrivy } from '@privy-io/react-auth';
import { Shield, Fingerprint, Delete } from 'lucide-react';
import { hashPin, authenticateBiometrics, isBiometricSupported } from '@/lib/security';

export const AppShield = React.memo(() => {
  const {
    isLocked,
    setLocked,
    isBiometricEnabled,
    biometricCredentialId,
    hashedPin,
    pinSalt,
    failedAttempts,
    incrementFailedAttempts,
    resetFailedAttempts,
    isSecurityEnabled,
    clearSecurity,
    isHydrated,
    setLastUnlockedAt,
    pendingAction,
    setPendingAction,
  } = useSecurityStore();

  const { clear: clearUser } = useUserStore();
  const { logout } = usePrivy();

  const [pin, setPin] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [isAnimating, setIsAnimating] = useState(false);
  const [isBioSupported, setIsBioSupported] = useState(false);

  // Check hardware support on mount
  useEffect(() => {
    isBiometricSupported().then(setIsBioSupported);
  }, []);

  // verifyPin is declared FIRST so handleDigit can reference it without a stale closure
  const verifyPin = useCallback(async (enteredPin: string) => {
    if (!pinSalt || !hashedPin) {
      console.warn('[SECURITY] Missing Salt or Hashed PIN — nothing to verify.');
      return;
    }
    try {
      const enteredHash = await hashPin(enteredPin, pinSalt);
      if (enteredHash === hashedPin) {
        resetFailedAttempts();
        setLastUnlockedAt(Date.now());
        setPin('');
        setIsAnimating(true);
        setTimeout(() => {
          if (pendingAction === 'disableSecurity') {
            setPendingAction(null);
            clearSecurity();
          } else {
            setLocked(false);
          }
          setIsAnimating(false);
        }, 150);
      } else {
        setPin('');
        setError('Incorrect PIN');
        incrementFailedAttempts();
        if (failedAttempts + 1 >= 5) {
          await logout();
          clearUser();
          clearSecurity();
          window.location.href = '/';
        }
      }
    } catch {
      setError('Security error');
    }
  }, [hashedPin, pinSalt, failedAttempts, incrementFailedAttempts, resetFailedAttempts, setLastUnlockedAt, setLocked, logout, clearUser, clearSecurity, pendingAction, setPendingAction]);

  // handleDigit is declared AFTER verifyPin so the closure is fresh
  const handleDigit = useCallback((digit: string) => {
    setPin(prev => {
      if (prev.length >= 6) return prev;
      const next = prev + digit;
      if (next.length === 6) {
        // call async verification without blocking the state setter
        verifyPin(next);
      }
      return next;
    });
    setError(null);
  }, [verifyPin]);

  const handleBackspace = useCallback(() => {
    setPin(prev => prev.slice(0, -1));
  }, []);

  // Effect removed — verification is triggered directly from handleDigit

  // Handle Real Biometric Challenge
  const handleBiometricClick = useCallback(async () => {
    if (!isBiometricEnabled || !biometricCredentialId) return;

    const success = await authenticateBiometrics(biometricCredentialId);
    if (success) {
      resetFailedAttempts();
      setLastUnlockedAt(Date.now());
      if (pendingAction === 'disableSecurity') {
        setPendingAction(null);
        clearSecurity();
      } else {
        setLocked(false);
      }
    } else {
      setError('Biometric auth failed');
    }
  }, [isBiometricEnabled, biometricCredentialId, resetFailedAttempts, setLastUnlockedAt, setLocked, pendingAction, setPendingAction, clearSecurity]);

  // Auto-trigger biometrics if enabled when locked
  useEffect(() => {
    if (isLocked && isBiometricEnabled && biometricCredentialId) {
      // Small delay to allow the overlay to render
      const timer = setTimeout(handleBiometricClick, 500);
      return () => clearTimeout(timer);
    }
  }, [isLocked, isBiometricEnabled, biometricCredentialId, handleBiometricClick]);

  if (!isHydrated) {
    // The real persisted lock state isn't known yet. Block content rather
    // than risk a flash of the dashboard while zustand finishes reading
    // localStorage, in case the true state is "locked".
    return <div className="fixed inset-0 z-[9999] bg-[#F8FAFD]" />;
  }

  if (!isLocked || !isSecurityEnabled) return null;

  return (
    <div className={`fixed inset-0 z-[9999] flex flex-col bg-[#F8FAFD] transition-all duration-500 ease-in-out ${isAnimating ? 'opacity-0 scale-95 pointer-events-none' : 'opacity-100 scale-100'}`}>
      <div className="flex-1 flex flex-col items-center justify-center px-8 text-center space-y-6">
        <div className="w-20 h-20 bg-blue-50 rounded-full flex items-center justify-center text-blue-500 animate-pulse">
          <Shield size={40} />
        </div>

        <div className="space-y-2">
          <h1 className="text-2xl font-bold text-gray-900">
            {pendingAction === 'disableSecurity' ? 'Confirm Your Identity' : 'Protected Account'}
          </h1>
          <p className="text-gray-500 text-sm max-w-[240px]">
            {pendingAction === 'disableSecurity'
              ? 'Verify your PIN or biometrics to remove App Lock.'
              : 'Please verify your identity to continue to your dashboard.'}
          </p>
        </div>

        <div className="flex gap-4 pt-4">
          {[...Array(6)].map((_, i) => (
            <div
              key={i}
              className={`w-3.5 h-3.5 rounded-full border-2 transition-all duration-200 ${pin.length > i
                ? 'bg-blue-500 border-blue-500 scale-110'
                : error ? 'border-red-300' : 'border-gray-200'
                }`}
            />
          ))}
        </div>

        {error && (
          <p className="text-red-500 text-sm font-medium animate-bounce">
            {error} ({5 - failedAttempts} attempts remaining)
          </p>
        )}
      </div>

      <div className="pb-16 px-10">
        <div className="grid grid-cols-3 gap-y-4 gap-x-8 max-w-[300px] mx-auto">
          {[1, 2, 3, 4, 5, 6, 7, 8, 9].map((num) => (
            <button
              key={num}
              onPointerDown={(e) => {
                e.preventDefault();
                handleDigit(num.toString());
              }}
              className="h-16 w-16 rounded-full flex items-center justify-center text-2xl font-semibold text-gray-700 hover:bg-gray-100 active:bg-gray-200 active:scale-90 transition-colors outline-none cursor-pointer select-none touch-manipulation"
            >
              {num}
            </button>
          ))}

          <button
            onPointerDown={(e) => {
              e.preventDefault();
              handleBiometricClick();
            }}
            className={`h-16 w-16 rounded-full flex items-center justify-center text-blue-500 hover:bg-blue-50 active:scale-95 transition-all outline-none touch-manipulation ${(!isBiometricEnabled || !isBioSupported) && 'opacity-0 pointer-events-none'}`}
          >
            <Fingerprint size={28} />
          </button>

          <button
            onPointerDown={(e) => {
              e.preventDefault();
              handleDigit('0');
            }}
            className="h-16 w-16 rounded-full flex items-center justify-center text-2xl font-semibold text-gray-700 hover:bg-gray-100 active:bg-gray-200 active:scale-90 transition-colors outline-none cursor-pointer select-none touch-manipulation"
          >
            0
          </button>

          <button
            onPointerDown={(e) => {
              e.preventDefault();
              handleBackspace();
            }}
            className="h-16 w-16 rounded-full flex items-center justify-center text-gray-400 hover:bg-gray-50 active:scale-95 transition-all outline-none touch-manipulation"
          >
            <Delete size={24} />
          </button>
        </div>
      </div>

      <div className="pb-10 text-center">
        <button
          onClick={async () => {
            await logout();
            clearUser();
            clearSecurity();
            window.location.href = '/';
          }}
          className="text-gray-400 text-sm font-medium hover:text-gray-600 transition-colors outline-none"
        >
          Forgot PIN? Sign out
        </button>
      </div>
    </div>
  );
});
