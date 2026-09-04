const CLEAN_PARAMS =
  'hairAccessoriesProbability=0&glassesProbability=0&earringsProbability=0&frecklesProbability=0';

/** Ambient fallback before the user has ever chosen an avatar. */
export function defaultAvatarUrl(seed: string): string {
  return `https://api.dicebear.com/8.x/lorelei/svg?seed=${encodeURIComponent(seed)}&backgroundColor=b6e3f4&beardProbability=0&${CLEAN_PARAMS}`;
}

export interface AvatarPreset {
  id: string;
  hair: string;
  beard: boolean;
  backgroundColor: string;
}

export const AVATAR_PRESETS: AvatarPreset[] = [
  { id: 'f1', hair: 'variant10', beard: false, backgroundColor: 'ffd5dc' },
  { id: 'f2', hair: 'variant22', beard: false, backgroundColor: 'ffdfbf' },
  { id: 'f3', hair: 'variant34', beard: false, backgroundColor: 'c0aede' },
  { id: 'm1', hair: 'variant01', beard: true, backgroundColor: 'b6e3f4' },
  { id: 'm2', hair: 'variant14', beard: true, backgroundColor: 'd1f4d1' },
  { id: 'm3', hair: 'variant27', beard: true, backgroundColor: 'ffe3b3' },
];

export function avatarUrlForPreset(preset: AvatarPreset, uniqueSeed: string): string {
  const beardParams = preset.beard ? 'beard=variant01&beardProbability=100' : 'beardProbability=0';
  const seed = encodeURIComponent(`${uniqueSeed}-${preset.id}`);
  return `https://api.dicebear.com/8.x/lorelei/svg?seed=${seed}&hair=${preset.hair}&${beardParams}&backgroundColor=${preset.backgroundColor}&${CLEAN_PARAMS}`;
}
