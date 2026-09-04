'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { Shield, Fingerprint, Delete, X, ArrowLeft, Check } from 'lucide-react';
import { hashPin, generateSalt, registerBiometrics, isBiometricSupported, isWeakPin } from '@/lib/security';
import { useSecurityStore } from '@/store/security-store';

interface SecuritySetupProps {
  onComplete: () => void;
  onCancel: () => void;
  userId: string;
  userName: string;
}

type SetupStep = 'ENTER' | 'CONFIRM' | 'BIOMETRIC';

export const SecuritySetup: React.FC<SecuritySetupProps> = ({
  onComplete,
  onCancel,
  userId,
  userName
}) => {
  const { setPin, setBiometricEnabled, setBiometricCredentialId } = useSecurityStore();

  const [step, setStep] = useState<SetupStep>('ENTER');
  const [pin, setPinInput] = useState('');
  const [confirmPin, setConfirmPin] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [isBioSupported, setIsBioSupported] = useState(false);

  useEffect(() => {
    isBiometricSupported().then(setIsBioSupported);
  }, []);

  // Declared FIRST so handleDigit can reference them without stale closures
  const proceedToConfirm = useCallback((nextPin?: string) => {
    const p = nextPin ?? pin;
    if (p.length === 6) {
      if (isWeakPin(p)) {
        setError('Choose a less predictable PIN.');
        setPinInput('');
        return;
      }
      setStep('CONFIRM');
      setPinInput(p);
    }
  }, [pin]);

  const finalizePin = useCallback(async (nextConfirm?: string) => {
    const p1 = pin;
    const p2 = nextConfirm ?? confirmPin;
    if (p1 === p2) {
      const salt = generateSalt();
      const hashed = await hashPin(p1, salt);
      setPin(hashed, salt, userId);
      if (isBioSupported) {
        setStep('BIOMETRIC');
      } else {
        onComplete();
      }
    } else {
      setConfirmPin('');
      setError('PINs do not match. Try again.');
      setStep('ENTER');
      setPinInput('');
    }
  }, [pin, confirmPin, isBioSupported, setPin, onComplete]);

  const handleDigit = useCallback((digit: string) => {
    if (step === 'ENTER') {
      setPinInput(prev => {
        if (prev.length >= 6) return prev;
        const next = prev + digit;
        if (next.length === 6) proceedToConfirm(next);
        return next;
      });
      setError(null);
    } else if (step === 'CONFIRM') {
      setConfirmPin(prev => {
        if (prev.length >= 6) return prev;
        const next = prev + digit;
        if (next.length === 6) finalizePin(next);
        return next;
      });
      setError(null);
    }
  }, [step, proceedToConfirm, finalizePin]);

  const handleBackspace = useCallback(() => {
    if (step === 'ENTER') setPinInput(prev => prev.slice(0, -1));
    else if (step === 'CONFIRM') setConfirmPin(prev => prev.slice(0, -1));
  }, [step]);

  const handleEnableBiometrics = async () => {
    try {
      const credId = await registerBiometrics(userId, userName);
      setBiometricCredentialId(credId);
      setBiometricEnabled(true);
      onComplete();
    } catch (err) {
      console.error('Biometric registration failed', err);
      onComplete(); // Still complete PIN setup if biometrics fail
    }
  };

  return (
    <div className="fixed inset-0 z-[10000] flex flex-col bg-[#F8FAFD] animate-in fade-in slide-in-from-bottom-5 duration-300">

      {/* Header */}
      <div className="pt-16 px-6 flex items-center justify-between">
        <button
          onClick={step === 'CONFIRM' ? () => { setStep('ENTER'); setConfirmPin(''); } : onCancel}
          className="p-2 hover:bg-gray-100 rounded-full transition-colors"
        >
          {step === 'CONFIRM' ? <ArrowLeft size={22} className="text-[#1C1C1C]" /> : <X size={22} className="text-[#1C1C1C]" />}
        </button>
        <h2 className="text-[17px] font-bold text-[#1C1C1C]">
          {step === 'ENTER' && 'Set Security PIN'}
          {step === 'CONFIRM' && 'Confirm PIN'}
          {step === 'BIOMETRIC' && 'Enable Biometrics'}
        </h2>
        <div className="w-10" />
      </div>

      {/* Content */}
      <div className="flex-1 flex flex-col items-center justify-center px-8 text-center space-y-8">
        {step === 'BIOMETRIC' ? (
          <div className="space-y-6">
            <div className="w-24 h-24 bg-blue-50 rounded-full flex items-center justify-center text-blue-500 mx-auto">
              <Fingerprint size={48} />
            </div>
            <div className="space-y-2">
              <h1 className="text-2xl font-bold text-gray-900">Enable FaceID?</h1>
              <p className="text-gray-500 text-sm max-w-[260px] mx-auto">
                Use your device's native security for faster access to Fx-Remit.
              </p>
            </div>
            <div className="flex flex-col gap-3 pt-4">
              <button
                onClick={handleEnableBiometrics}
                className="w-full bg-[#2261FE] text-white font-bold py-4 rounded-[18px] active:scale-95 transition-all outline-none"
              >
                Enable Biometrics
              </button>
              <button
                onClick={onComplete}
                className="w-full text-gray-400 font-bold py-4 rounded-[18px] active:scale-95 transition-all outline-none text-sm"
              >
                Maybe Later
              </button>
            </div>
          </div>
        ) : (
          <>
            <div className="w-20 h-20 bg-blue-50 rounded-full flex items-center justify-center text-blue-500">
              <Shield size={40} />
            </div>

            <div className="space-y-2">
              <h1 className="text-2xl font-bold text-gray-900">
                {step === 'ENTER' ? 'Create Secure PIN' : 'Repeat your PIN'}
              </h1>
              <p className="text-gray-500 text-sm max-w-[240px]">
                {step === 'ENTER'
                  ? 'Set a 6-digit PIN to safely secure your remittance account.'
                  : 'Please re-enter the PIN to confirm your master lockout.'}
              </p>
            </div>

            {/* PIN Indicators */}
            <div className="flex gap-4 pt-2">
              {[...Array(6)].map((_, i) => {
                const isFilled = step === 'ENTER' ? pin.length > i : confirmPin.length > i;
                return (
                  <div
                    key={i}
                    className={`w-3.5 h-3.5 rounded-full border-2 transition-all duration-200 ${isFilled
                      ? 'bg-blue-500 border-blue-500 scale-110'
                      : error ? 'border-red-300' : 'border-gray-200'
                      }`}
                  />
                );
              })}
            </div>

            {error && (
              <p className="text-red-500 text-sm font-medium animate-bounce">
                {error}
              </p>
            )}
          </>
        )}
      </div>

      {/* Number Pad for PIN steps */}
      {step !== 'BIOMETRIC' && (
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

            <div className="w-16 h-16" />

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
      )}
    </div>
  );
};
