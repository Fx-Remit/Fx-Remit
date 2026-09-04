'use client';

import { useRef, useState } from 'react';
import { X, Check, Camera } from 'lucide-react';
import { usePrivy } from '@privy-io/react-auth';
import { useUserStore } from '@/store/user-store';
import { createClient } from '@/utils/supabase/client';
import { AVATAR_PRESETS, avatarUrlForPreset } from '@/lib/avatar';

interface EditProfileSheetProps {
  isOpen: boolean;
  onClose: () => void;
}

const ALLOWED_AVATAR_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp', 'image/gif']);
const MAX_AVATAR_BYTES = 5 * 1024 * 1024;

function readImagePreview(file: File): Promise<string | null> {
  return new Promise((resolve) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = reader.result;
      if (
        typeof result === 'string' &&
        /^data:image\/(?:jpeg|png|webp|gif);base64,/.test(result)
      ) {
        resolve(result);
        return;
      }
      resolve(null);
    };
    reader.onerror = () => resolve(null);
    reader.readAsDataURL(file);
  });
}

export function EditProfileSheet({ isOpen, onClose }: EditProfileSheetProps) {
  const { getAccessToken } = usePrivy();
  const { profile: dbUser, setProfile } = useUserStore();
  const supabase = createClient();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [name, setName] = useState(dbUser?.displayName || '');
  const [avatarUrl, setAvatarUrl] = useState(dbUser?.avatarUrl || '');
  const [avatarFile, setAvatarFile] = useState<File | null>(null);
  const [avatarPreview, setAvatarPreview] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!isOpen || !dbUser) return null;

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;

    if (!ALLOWED_AVATAR_TYPES.has(file.type)) {
      setError('Please choose a JPEG, PNG, WEBP, or GIF image.');
      return;
    }
    if (file.size > MAX_AVATAR_BYTES) {
      setError('Image must be under 5MB.');
      return;
    }

    const preview = await readImagePreview(file);
    if (!preview) {
      setError('Could not read that image. Try a different file.');
      return;
    }

    setError(null);
    setAvatarFile(file);
    setAvatarPreview(preview);
  };

  const handleSelectPreset = (presetUrl: string) => {
    setAvatarFile(null);
    setAvatarPreview(null);
    setAvatarUrl(presetUrl);
  };

  const handleSave = async () => {
    const trimmed = name.trim();
    if (!trimmed) {
      setError('Name cannot be empty');
      return;
    }
    setSaving(true);
    setError(null);
    try {
      let finalAvatarUrl = avatarUrl;

      if (avatarFile) {
        const safeFileName = avatarFile.name.replace(/[^a-z0-9.]/gi, '_').toLowerCase();
        const filePath = `avatars/${Date.now()}-${safeFileName}`;

        const { error: uploadError } = await supabase.storage
          .from('avatars')
          .upload(filePath, avatarFile, {
            upsert: true,
            contentType: avatarFile.type,
          });

        if (uploadError) {
          setError('Photo upload failed. Please try again.');
          setSaving(false);
          return;
        }

        const { data } = supabase.storage.from('avatars').getPublicUrl(filePath);
        finalAvatarUrl = data.publicUrl;
      }

      const token = await getAccessToken();
      const res = await fetch('/api/user/profile', {
        method: 'PATCH',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ displayName: trimmed, avatarUrl: finalAvatarUrl }),
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

  const previewSrc =
    avatarPreview || avatarUrl || avatarUrlForPreset(AVATAR_PRESETS[0], dbUser.id);

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

        <input
          type="file"
          ref={fileInputRef}
          onChange={handleFileChange}
          accept="image/jpeg,image/png,image/webp,image/gif"
          className="hidden"
        />

        <div className="relative mx-auto mb-6 w-fit">
          <div className="w-[80px] h-[80px] rounded-full overflow-hidden border-2 border-white shadow-sm bg-[#E0E7FF]">
            <img src={previewSrc} alt="" className="w-full h-full object-cover" />
          </div>
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            className="absolute bottom-0 right-0 flex h-8 w-8 items-center justify-center rounded-full border-2 border-[#f6f6f6] bg-[#2261FE] active:scale-90 transition-transform"
            aria-label="Upload photo"
          >
            <Camera size={16} className="text-white" />
          </button>
        </div>

        <div className="mb-6 space-y-3">
          <div>
            <p className="text-[11px] font-bold text-[#6D6D6D] uppercase tracking-widest px-1 mb-2 text-center">
              Feminine
            </p>
            <div className="flex justify-center gap-3">
              {AVATAR_PRESETS.filter((p) => !p.beard).map((preset) => {
                const url = avatarUrlForPreset(preset, dbUser.id);
                const selected = !avatarFile && avatarUrl === url;
                return (
                  <button
                    key={preset.id}
                    type="button"
                    onClick={() => handleSelectPreset(url)}
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
          </div>

          <div>
            <p className="text-[11px] font-bold text-[#6D6D6D] uppercase tracking-widest px-1 mb-2 text-center">
              Masculine
            </p>
            <div className="flex justify-center gap-3">
              {AVATAR_PRESETS.filter((p) => p.beard).map((preset) => {
                const url = avatarUrlForPreset(preset, dbUser.id);
                const selected = !avatarFile && avatarUrl === url;
                return (
                  <button
                    key={preset.id}
                    type="button"
                    onClick={() => handleSelectPreset(url)}
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
          </div>
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
