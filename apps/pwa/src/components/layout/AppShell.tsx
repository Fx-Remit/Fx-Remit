import type { CSSProperties, ReactNode } from 'react';

type AppShellProps = {
  children: ReactNode;
};

export function AppShell({ children }: AppShellProps) {
  return (
    <div
      className="relative mx-auto flex min-h-[100dvh] w-full max-w-[var(--app-max)] flex-col overflow-x-hidden bg-white md:shadow-[0_0_0_1px_rgba(0,0,0,0.04),0_12px_40px_rgba(0,0,0,0.08)]"
      style={
        {
          ['--app-max' as string]: '430px',
          paddingTop: 'env(safe-area-inset-top)',
          paddingBottom: 'env(safe-area-inset-bottom)',
        } as CSSProperties
      }
    >
      {children}
    </div>
  );
}
