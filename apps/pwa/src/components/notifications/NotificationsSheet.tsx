'use client';

import { Bell, CheckCheck, X } from 'lucide-react';
import { usePrivy } from '@privy-io/react-auth';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { subscribeToWebPush } from '@/lib/push/register';

type NotificationRow = {
  id: string;
  type: string;
  title: string;
  body: string;
  transactionId: string;
  readAt: string | null;
  createdAt: string;
  url: string;
};

interface NotificationsSheetProps {
  isOpen: boolean;
  onClose: () => void;
}

export function NotificationsSheet({ isOpen, onClose }: NotificationsSheetProps) {
  const { getAccessToken, authenticated } = usePrivy();
  const queryClient = useQueryClient();
  const router = useRouter();
  const [pushStatus, setPushStatus] = useState<string | null>(null);
  const [pushBusy, setPushBusy] = useState(false);

  const { data, isLoading } = useQuery({
    queryKey: ['notifications', 'inbox', 50],
    queryFn: async () => {
      const token = await getAccessToken();
      const res = await fetch('/api/user/notifications?limit=50', {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || `Notifications failed: ${res.status}`);
      }
      return res.json() as Promise<{
        notifications: NotificationRow[];
        unreadCount: number;
      }>;
    },
    enabled: isOpen && authenticated,
    staleTime: 10_000,
  });

  if (!isOpen) return null;

  const notifications = data?.notifications || [];

  const markAllRead = async () => {
    const token = await getAccessToken();
    await fetch('/api/user/notifications', {
      method: 'PATCH',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ all: true }),
    });
    queryClient.invalidateQueries({ queryKey: ['notifications'] });
  };

  const openNotification = async (n: NotificationRow) => {
    if (!n.readAt) {
      const token = await getAccessToken();
      await fetch('/api/user/notifications', {
        method: 'PATCH',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ ids: [n.id] }),
      });
      queryClient.invalidateQueries({ queryKey: ['notifications'] });
    }
    onClose();
    router.push(n.url || `/history?tx=${n.transactionId}`);
  };

  const enablePush = async () => {
    setPushBusy(true);
    setPushStatus(null);
    try {
      const result = await subscribeToWebPush(getAccessToken);
      setPushStatus(result.ok ? 'Phone alerts enabled' : result.reason || 'Could not enable');
    } finally {
      setPushBusy(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[100] flex items-end justify-center">
      <div className="absolute inset-0 bg-black/30" onClick={onClose} />

      <div className="relative w-full max-w-[430px] max-h-[85dvh] flex flex-col rounded-t-[40px] bg-[#f6f6f6] px-6 pb-[max(2rem,env(safe-area-inset-bottom))] pt-4 shadow-2xl animate-in slide-in-from-bottom duration-300">
        <div className="flex justify-center mb-4">
          <div className="w-12 h-1 bg-gray-300 rounded-full" />
        </div>

        <button
          onClick={onClose}
          className="absolute right-6 top-6 w-8 h-8 flex items-center justify-center text-gray-900"
          aria-label="Close notifications"
        >
          <X size={24} />
        </button>

        <div className="text-center mb-4">
          <h2 className="text-[22px] font-bold text-[#1C1C1C]">Notifications</h2>
          <p className="text-[#888888] text-[14px] mt-1 font-medium">
            Deposits and cash-out updates
          </p>
        </div>

        <div className="flex items-center justify-between gap-2 mb-4">
          <button
            type="button"
            onClick={enablePush}
            disabled={pushBusy}
            className="flex-1 rounded-2xl bg-[#2261FE] text-white text-[14px] font-semibold py-3 disabled:opacity-60"
          >
            {pushBusy ? 'Enabling…' : 'Enable phone alerts'}
          </button>
          <button
            type="button"
            onClick={markAllRead}
            className="rounded-2xl bg-white border border-gray-200 text-[#2261FE] px-3 py-3"
            aria-label="Mark all read"
          >
            <CheckCheck size={20} />
          </button>
        </div>
        {pushStatus && (
          <p className="text-center text-[13px] text-gray-500 mb-3">{pushStatus}</p>
        )}

        <div className="overflow-y-auto flex-1 -mx-2 px-2 space-y-2">
          {isLoading && (
            <p className="text-center text-gray-400 py-10 text-sm">Loading…</p>
          )}
          {!isLoading && notifications.length === 0 && (
            <div className="flex flex-col items-center justify-center py-14 text-gray-400">
              <Bell size={32} className="mb-3 opacity-40" />
              <p className="text-sm font-medium">No notifications yet</p>
              <p className="text-xs mt-1 text-center px-6">
                You’ll see deposits and transfer updates here
              </p>
            </div>
          )}
          {notifications.map((n) => (
            <button
              key={n.id}
              type="button"
              onClick={() => openNotification(n)}
              className={`w-full text-left rounded-[20px] px-4 py-3.5 border transition-colors ${
                n.readAt
                  ? 'bg-white border-gray-100'
                  : 'bg-blue-50/80 border-blue-100'
              }`}
            >
              <div className="flex items-start justify-between gap-2">
                <p className="font-semibold text-[15px] text-[#1C1C1C]">{n.title}</p>
                {!n.readAt && (
                  <span className="mt-1.5 w-2 h-2 rounded-full bg-[#2261FE] shrink-0" />
                )}
              </div>
              <p className="text-[13px] text-gray-500 mt-0.5 leading-snug">{n.body}</p>
              <p className="text-[11px] text-gray-400 mt-2">
                {new Date(n.createdAt).toLocaleString(undefined, {
                  month: 'short',
                  day: 'numeric',
                  hour: 'numeric',
                  minute: '2-digit',
                })}
              </p>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
