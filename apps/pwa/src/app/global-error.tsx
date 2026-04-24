'use client';

import React from 'react';
import { AlertCircle, RefreshCw } from 'lucide-react';

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <html lang="en">
      <body className="font-sans antialiased">
        <div className="min-h-screen bg-[#F8FAFD] flex flex-col items-center justify-center p-6 text-center">
          <div className="w-full max-w-[380px] bg-white rounded-[40px] px-8 py-12 shadow-[0px_4px_30px_rgba(0,0,0,0.05)] border border-gray-100 flex flex-col items-center">
            
            {/* Error Icon */}
            <div className="w-20 h-20 bg-red-50 rounded-full flex items-center justify-center mb-8">
              <AlertCircle size={40} className="text-red-500" />
            </div>

            {/* Error Message */}
            <h1 className="text-[24px] font-bold text-[#1C1C1C] mb-4">Something went wrong</h1>
            <p className="text-[#888888] text-[15px] font-medium leading-[160%] mb-10 px-2">
              We encountered a critical error. This might be due to a poor connection or system maintenance.
            </p>

            {/* Actions */}
            <div className="w-full space-y-4">
              <button
                onClick={() => reset()}
                className="w-full h-[65px] bg-[#2261FE] text-white font-bold text-[18px] rounded-[15px] flex items-center justify-center gap-3 shadow-lg shadow-[#2261FE]/20 active:scale-[0.98] transition-all"
              >
                <RefreshCw size={20} />
                Try again
              </button>
              
              <button
                onClick={() => window.location.href = '/home'}
                className="w-full h-[65px] bg-white text-[#2261FE] font-bold text-[18px] rounded-[15px] border-2 border-[#2261FE]/10 flex items-center justify-center gap-3 active:scale-[0.98] transition-all"
              >
                Back to home
              </button>
            </div>
          </div>
          
          {/* Debug Info (Only in dev) */}
          {process.env.NODE_ENV !== 'production' && (
            <div className="mt-8 max-w-[400px] text-left">
               <details className="cursor-pointer">
                 <summary className="text-[10px] text-gray-400 uppercase font-bold tracking-widest text-center">Technical Details</summary>
                 <div className="mt-4 p-4 bg-gray-900 rounded-xl text-[12px] text-green-400 font-mono overflow-auto max-h-[200px]">
                   {error.message || error.toString()}
                   {error.digest && <div className="mt-2 text-gray-500">ID: {error.digest}</div>}
                 </div>
               </details>
            </div>
          )}
        </div>
      </body>
    </html>
  );
}
