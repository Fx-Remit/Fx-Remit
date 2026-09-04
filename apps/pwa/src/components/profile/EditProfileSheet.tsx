'use client';

import { useState } from 'react';
import { X, Check } from 'lucide-react';
import { usePrivy } from '@privy-io/react-auth';
import { useUserStore } from '@/store/user-store';

interface EditProfileSheetProps {
  isOpen: boolean;
  onClose: () => void;
}

const AVATAR_BACKGROUNDS = ['b6e3f4', 'ffd5dc', 'c0aede', 'ffdfbf', 'd1f4d1', 'ffe3b3'];

export function EditProfileSheet({ isOpen, onClose }: EditProfileSheetProps) {
  const { getAccessToken } = usePrivy();
  const { profile: dbUser, setProfile } = useUserStore();

  const [name, setName] = useState(dbUser?.displayName || '');
  const [avatarUrl, setAvatarUrl] = useState(dbUser?.avatarUrl || '');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!isOpen || !dbUser) return null;

  const avatarFor = (bg: string) =>
    `https://api.dicebear.com/8.x/lorelei/svg?seed=${dbUser.id}&backgroundColor=${bg}`;

  const handleSave = async () => {
    const trimmed = name.trim();
    if (!trimmed) {
      setError('Name cannot be empty');
      return;
    }
    setSaving(true);
    setError(null);
    try {
      const token = await getAccessToken();
      const res = await fetch('/api/user/profile', {
        method: 'PATCH',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ displayName: trimmed, avatarUrl }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(json.error || 'Could not save changes');
        return;
      }
      setProfile({ ...dbUser, displayName: json.displayName, avatarUrl: json.avatarUrl });
      onClose();
    } catch {
      setError('Could not save changes');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[100] flex items-end justify-center">
      <div className="absolute inset-0 bg-black/30" onClick={onClose} />

      <div className="relative w-full max-w-[430px] max-h-[85dvh] flex flex-col overflow-y-auto rounded-t-[40px] bg-[#f6f6f6] px-6 pb-[max(2rem,env(safe-area-inset-bottom))] pt-4 shadow-2xl animate-in slide-in-from-bottom duration-300">
        <div className="flex justify-center mb-4">
          <div className="w-12 h-1 bg-gray-300 rounded-full" />
        </div>

        <button
          onClick={onClose}
          className="absolute right-6 top-6 w-8 h-8 flex items-center justify-center text-gray-900"
          aria-label="Close"
        >
          <X size={24} />
        </button>

        <div className="text-center mb-6">
          <h2 className="text-[22px] font-bold text-[#1C1C1C]">Edit Profile</h2>
        </div>

        <div className="flex justify-center mb-6">
          <div className="w-[80px] h-[80px] rounded-full overflow-hidden border-2 border-white shadow-sm bg-[#E0E7FF]">
            <img
              src={avatarUrl || avatarFor(AVATAR_BACKGROUNDS[0])}
              alt=""
              className="w-full h-full object-cover"
            />
          </div>
        </div>

        <div className="flex justify-center gap-3 mb-6">
          {AVATAR_BACKGROUNDS.map((bg) => {
            const url = avatarFor(bg);
            const selected = avatarUrl === url;
            return (
              <button
                key={bg}
                type="button"
                onClick={() => setAvatarUrl(url)}
                className={`relative w-10 h-10 rounded-full overflow-hidden border-2 transition-all ${
                  selected ? 'border-[#2261FE] scale-110' : 'border-white'
                }`}
              >
                <img src={url} alt="" className="w-full h-full object-cover" />
                {selected && (
                  <span className="absolute inset-0 flex items-center justify-center bg-black/20">
                    <Check size={16} className="text-white" />
                  </span>
                )}
              </button>
            );
          })}
        </div>

        <div className="mb-2">
          <label className="text-[13px] font-bold text-[#6D6D6D] uppercase tracking-widest px-1">
            Display Name
          </label>
          <input
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            maxLength={60}
            className="w-full mt-2 bg-white rounded-2xl border border-gray-100 px-4 py-3.5 text-[16px] font-semibold text-[#1C1C1C] outline-none focus:ring-2 focus:ring-[#2261FE]/20"
            placeholder="Your name"
          />
        </div>

        {error && <p className="text-red-500 text-[13px] font-medium mt-2 px-1">{error}</p>}

        <button
          type="button"
          onClick={handleSave}
          disabled={saving}
          className="w-full mt-6 rounded-2xl bg-[#2261FE] text-white text-[16px] font-bold py-4 disabled:opacity-60"
        >
          {saving ? 'Saving…' : 'Save Changes'}
        </button>
      </div>
    </div>
  );
}
