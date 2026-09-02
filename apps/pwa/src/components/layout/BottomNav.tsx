'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { FileText, Home, User } from 'lucide-react';

const TABS = [
  { href: '/home', label: 'Home', Icon: Home },
  { href: '/history', label: 'History', Icon: FileText },
  { href: '/profile', label: 'Profile', Icon: User },
] as const;

export function BottomNav() {
  const pathname = usePathname();

  return (
    <div className="pointer-events-none fixed bottom-[max(1.5rem,env(safe-area-inset-bottom))] left-1/2 z-50 w-full max-w-[430px] -translate-x-1/2 px-5">
      <div className="pointer-events-auto mx-auto flex h-[75px] w-full max-w-[320px] items-center justify-between rounded-[70px] bg-[#D8E9FF] px-[30px] py-[15px] shadow-[0px_4px_4px_0px_#00000040]">
        {TABS.map(({ href, label, Icon }) => {
          const active = pathname === href || pathname.startsWith(`${href}/`);
          return (
            <Link
              key={href}
              href={href}
              className={`flex flex-col items-center gap-1 transition-colors ${
                active ? 'text-[#1C1C1C]' : 'text-[#1C1C1C]/40 hover:text-[#1C1C1C]'
              }`}
            >
              <Icon size={28} />
              <span className="text-[13px] font-semibold">{label}</span>
            </Link>
          );
        })}
      </div>
    </div>
  );
}
