'use client';

import { ChevronRight } from 'lucide-react';
import Link from 'next/link';
import React from 'react';

interface MenuRowProps {
  icon: React.ReactNode;
  label: string;
  subLabel?: string;
  onClick?: () => void;
  /** Renders as a next/link instead of a button when set. */
  href?: string;
  /** Replaces the trailing chevron, e.g. a Toggle switch. */
  trailing?: React.ReactNode;
  tone?: 'default' | 'danger';
  disabled?: boolean;
}

export function MenuRow({
  icon,
  label,
  subLabel,
  onClick,
  href,
  trailing,
  tone = 'default',
  disabled,
}: MenuRowProps) {
  const labelColor = tone === 'danger' ? 'text-red-500' : 'text-[#1C1C1C]';
  const iconWrapColor = tone === 'danger' ? 'bg-red-50 text-red-500' : 'bg-[#f8fafd] text-[#1C1C1C]';

  const content = (
    <div className="w-full flex items-center justify-between p-5 hover:bg-gray-50 transition-colors group">
      <div className="flex items-center gap-4">
        <div
          className={`w-10 h-10 rounded-full flex items-center justify-center group-hover:scale-110 transition-transform ${iconWrapColor}`}
        >
          {icon}
        </div>
        <div className="flex flex-col text-left">
          <span className={`text-[17px] font-bold ${labelColor}`}>{label}</span>
          {subLabel && (
            <span className="text-[13px] text-[#6D6D6D] font-medium whitespace-nowrap">
              {subLabel}
            </span>
          )}
        </div>
      </div>
      {trailing ?? (
        <ChevronRight
          size={18}
          className="text-gray-300 group-hover:text-[#1C1C1C] transition-colors"
        />
      )}
    </div>
  );

  if (href) {
    return (
      <Link href={href} className="block w-full text-left outline-none">
        {content}
      </Link>
    );
  }

  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className="w-full text-left outline-none disabled:opacity-50"
    >
      {content}
    </button>
  );
}
