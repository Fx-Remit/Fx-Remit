/**
 * Security Utilities 
 * PIN hashing (PBKDF2) and Biometric Authentication (WebAuthn).
 */

export function isSecurityAvailable(): boolean {
  if (typeof window === 'undefined') return false;
  return !!(window.isSecureContext && window.crypto?.subtle && window.PublicKeyCredential);
}

function toBase64Url(buffer: ArrayBuffer): string {
  const binary = String.fromCharCode(...new Uint8Array(buffer));
  return btoa(binary)
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=/g, '');
}

function fromBase64Url(base64url: string): Uint8Array {
  const base64 = base64url.replace(/-/g, '+').replace(/_/g, '/');
  const pad = base64.length % 4;
  const paddedBase64 = pad ? base64 + '='.repeat(4 - pad) : base64;
  const binary = atob(paddedBase64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
}

export function generateSalt(): string {
  if (typeof window === 'undefined') return '';
  const array = new Uint8Array(16);
  window.crypto.getRandomValues(array);
  return Array.from(array)
    .map(b => b.toString(16).padStart(2, '0'))
    .join('');
}

export async function hashPin(pin: string, salt: string): Promise<string> {
  if (!isSecurityAvailable()) {
    throw new Error('Cryptographic operations are only available in a secure context (HTTPS).');
  }

  const encoder = new TextEncoder();
  const pinData = encoder.encode(pin);
  const saltData = encoder.encode(salt);

  const baseKey = await window.crypto.subtle.importKey(
    'raw',
    pinData,
    'PBKDF2',
    false,
    ['deriveBits']
  );

  const derivedBits = await window.crypto.subtle.deriveBits(
    {
      name: 'PBKDF2',
      salt: saltData,
      iterations: 100000,
      hash: 'SHA-256',
    },
    baseKey,
    256
  );

  return Array.from(new Uint8Array(derivedBits))
    .map(b => b.toString(16).padStart(2, '0'))
    .join('');
}

export async function isBiometricSupported(): Promise<boolean> {
  if (!isSecurityAvailable()) return false;
  try {
    return await window.PublicKeyCredential.isUserVerifyingPlatformAuthenticatorAvailable();
  } catch {
    return false;
  }
}

export async function registerBiometrics(userId: string, userName: string): Promise<string> {
  if (!isSecurityAvailable()) throw new Error('WebAuthn unavailable');

  const challenge = crypto.getRandomValues(new Uint8Array(32));

  const options: PublicKeyCredentialCreationOptions = {
    challenge,
    rp: {
      name: "Fx Remit",
      id: window.location.hostname,
    },
    user: {
      id: new TextEncoder().encode(userId).slice(0, 64),
      name: userName,
      displayName: userName,
    },
    pubKeyCredParams: [
      { alg: -7, type: "public-key" },
      { alg: -257, type: "public-key" }
    ],
    authenticatorSelection: {
      authenticatorAttachment: "platform",
      userVerification: "required",
    },
    timeout: 60000,
    attestation: "none",
  };

  const credential = await navigator.credentials.create({
    publicKey: options,
  }) as PublicKeyCredential;

  if (!credential) throw new Error("Credential creation failed");
  
  return toBase64Url(credential.rawId);
}

export async function authenticateBiometrics(credentialId: string): Promise<boolean> {
  if (!isSecurityAvailable()) return false;

  const challenge = crypto.getRandomValues(new Uint8Array(32));
  const idArray = fromBase64Url(credentialId);

  const options: PublicKeyCredentialRequestOptions = {
    challenge,
    timeout: 60000,
    allowCredentials: [{
      id: idArray as any, 
      type: 'public-key',
      transports: ['internal'],
    }],
    userVerification: "required",
    rpId: window.location.hostname,
  };

  try {
    const assertion = await navigator.credentials.get({
      publicKey: options,
    });
    return !!assertion;
  } catch (err) {
    console.error("[SECURITY] Biometric assertion failed:", err);
    return false;
  }
}
