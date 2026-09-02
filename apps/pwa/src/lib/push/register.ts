'use client';

/** Register the static service worker used for Web Push. */
export async function registerPushServiceWorker(): Promise<ServiceWorkerRegistration | null> {
  if (typeof window === 'undefined' || !('serviceWorker' in navigator)) return null;
  try {
    return await navigator.serviceWorker.register('/sw.js', { scope: '/' });
  } catch (err) {
    console.warn('[push] service worker registration failed', err);
    return null;
  }
}

function urlBase64ToUint8Array(base64String: string): Uint8Array {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
  const raw = atob(base64);
  const output = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i += 1) {
    output[i] = raw.charCodeAt(i);
  }
  return output;
}

export async function subscribeToWebPush(getAccessToken: () => Promise<string | null>): Promise<{
  ok: boolean;
  reason?: string;
}> {
  if (!('Notification' in window) || !('PushManager' in window)) {
    return { ok: false, reason: 'Push is not supported on this browser' };
  }

  const vapid = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY?.trim();
  if (!vapid) {
    return { ok: false, reason: 'Push is not configured (missing VAPID public key)' };
  }

  const permission = await Notification.requestPermission();
  if (permission !== 'granted') {
    return { ok: false, reason: 'Notification permission denied' };
  }

  const registration = await registerPushServiceWorker();
  if (!registration) {
    return { ok: false, reason: 'Could not register service worker' };
  }

  const existing = await registration.pushManager.getSubscription();
  const subscription =
    existing ||
    (await registration.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: urlBase64ToUint8Array(vapid) as BufferSource,
    }));

  const token = await getAccessToken();
  if (!token) return { ok: false, reason: 'Not authenticated' };

  const res = await fetch('/api/user/push/subscribe', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(subscription.toJSON()),
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    return { ok: false, reason: err.error || `Subscribe failed (${res.status})` };
  }

  return { ok: true };
}
