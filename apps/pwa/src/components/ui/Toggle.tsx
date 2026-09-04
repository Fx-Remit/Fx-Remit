'use client';

interface ToggleProps {
  checked: boolean;
  onChange: (next: boolean) => void;
  disabled?: boolean;
  /** Shows a subtle dimmed state while an async toggle (permission prompt, fetch) is in flight. */
  busy?: boolean;
  'aria-label'?: string;
}

export function Toggle({ checked, onChange, disabled, busy, ...aria }: ToggleProps) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      disabled={disabled || busy}
      onClick={() => onChange(!checked)}
      className={`relative w-[46px] h-[26px] rounded-full transition-colors shrink-0 ${
        checked ? 'bg-[#2261FE]' : 'bg-gray-200'
      } ${busy ? 'opacity-60' : ''} disabled:opacity-40`}
      {...aria}
    >
      <span
        className={`absolute top-[3px] left-[3px] w-[20px] h-[20px] rounded-full bg-white shadow-sm transition-transform ${
          checked ? 'translate-x-[20px]' : 'translate-x-0'
        }`}
      />
    </button>
  );
}
