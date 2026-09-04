'use client';

import React from 'react';
import { ArrowLeft, Trash2 } from 'lucide-react';
import Link from 'next/link';
import { usePrivy } from '@privy-io/react-auth';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useUserStore } from '@/store/user-store';

type SavedRecipientRow = {
  id: string;
  type: 'BANK' | 'MOBILE';
  currency: string;
  institutionCode: string;
  institutionName: string;
  accountIdentifier: string;
  accountName: string;
};

export default function ManageRecipientsPage() {
  const { authenticated, getAccessToken } = usePrivy();
  const { profile: dbUser } = useUserStore();
  const queryClient = useQueryClient();
  const [removingId, setRemovingId] = React.useState<string | null>(null);

  const { data: recipientsData, isLoading } = useQuery({
    queryKey: ['user-recipients', dbUser?.id],
    queryFn: async () => {
      const token = await getAccessToken();
      const res = await fetch('/api/user/recipients', {
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data.success) {
        throw new Error(data.error || 'Failed to load saved recipients');
      }
      return (data.recipients || []) as SavedRecipientRow[];
    },
    enabled: !!dbUser?.id && !!authenticated,
  });

  const recipients = recipientsData || [];

  const removeRecipient = async (row: SavedRecipientRow) => {
    if (removingId) return;
    setRemovingId(row.id);
    try {
      const token = await getAccessToken();
      const res = await fetch(`/api/user/recipients/${encodeURIComponent(row.id)}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data.success) {
        throw new Error(data.error || 'Failed to remove recipient');
      }
      await queryClient.invalidateQueries({ queryKey: ['user-recipients'] });
      await queryClient.invalidateQueries({ queryKey: ['saved-recipients'] });
    } catch (err) {
      console.error('[MANAGE_RECIPIENTS] remove failed:', err);
    } finally {
      setRemovingId(null);
    }
  };

  return (
    <div className="min-h-screen bg-[#F8FAFD] flex flex-col items-center">
      <div className="w-full max-w-[430px] flex flex-col min-h-screen">
        <div className="pt-16 px-6 pb-6 bg-white shrink-0">
          <div className="flex items-center justify-between mb-2">
            <Link
              href="/profile"
              className="p-2 -ml-2 hover:bg-gray-100 rounded-full transition-colors"
            >
              <ArrowLeft size={24} className="text-[#1C1C1C]" />
            </Link>
            <h1 className="text-[20px] font-bold text-[#1C1C1C]">Manage Recipients</h1>
            <div className="w-10" />
          </div>
        </div>

        <div className="flex-1 px-6 py-6 space-y-2">
          {isLoading ? (
            <p className="py-10 text-center text-[15px] font-medium text-gray-400">
              Loading recipients…
            </p>
          ) : recipients.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-20 text-center">
              <p className="text-gray-900 font-bold">No saved recipients yet</p>
              <p className="text-gray-400 text-sm mt-1 max-w-[240px]">
                Recipients you save during cash-out will show up here.
              </p>
            </div>
          ) : (
            recipients.map((row) => (
              <div
                key={row.id}
                className="flex w-full items-center gap-2 rounded-[20px] border border-gray-100 bg-white shadow-[0px_4px_15px_rgba(0,0,0,0.01)]"
              >
                <div className="flex min-w-0 flex-1 items-center gap-3 px-4 py-4">
                  <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-[#E1EFFF] text-[14px] font-bold text-[#2261FE]">
                    {row.institutionName.slice(0, 2).toUpperCase()}
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-[15px] font-bold text-[#1C1C1C]">
                      {row.accountName}
                    </p>
                    <p className="truncate text-[13px] font-medium text-gray-400">
                      {row.institutionName} · ···{row.accountIdentifier.slice(-4)}
                    </p>
                  </div>
                </div>
                <button
                  type="button"
                  aria-label={`Remove ${row.accountName}`}
                  disabled={removingId === row.id}
                  onClick={() => removeRecipient(row)}
                  className="mr-2 flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-gray-400 transition-colors hover:bg-red-50 hover:text-red-500 disabled:opacity-40"
                >
                  <Trash2 size={18} />
                </button>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
}
