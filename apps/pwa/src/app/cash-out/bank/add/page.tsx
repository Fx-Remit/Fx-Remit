'use client';

import { ChevronLeft, ChevronDown, Search, X, CheckCircle2, Loader2 } from 'lucide-react';
import { useRouter, useSearchParams } from 'next/navigation';
import { useState, Suspense } from 'react';
import { useQuery } from '@tanstack/react-query';

function AddAccountForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const type = searchParams.get('type') || 'bank';
  const send = searchParams.get('send') || '0';
  const receive = searchParams.get('receive') || '0';
  const token = searchParams.get('token') || 'USDT';
  const currency = searchParams.get('currency') || 'NGN';

  // Form states
  const [accountNumber, setAccountNumber] = useState('');
  const [manualAccountName, setManualAccountName] = useState('');
  const [bankName, setBankName] = useState('');
  const [bankCode, setBankCode] = useState('');
  const [isBankSheetOpen, setIsBankSheetOpen] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');

  const isBank = type === 'bank';

  // Fetch institutions
  const { data: institutionsData } = useQuery({
    queryKey: ['institutions', currency],
    queryFn: async () => {
      const res = await fetch(`/api/paycrest/institutions?country=${currency === 'NGN' ? 'NG' : 'KE'}`);
      const data = await res.json();
      return data.success ? data.institutions : [];
    },
  });

  const institutions = institutionsData || [];

  // Auto-verify account name
  const { data: verifyData, isFetching: isVerifying } = useQuery({
    queryKey: ['verify-account', accountNumber, bankCode, currency],
    queryFn: async () => {
      const res = await fetch('/api/paycrest/verify-account', {
        method: 'POST',
        body: JSON.stringify({ accountNumber, bankCode, countryCode: currency === 'NGN' ? 'NG' : 'KE' })
      });
      const data = await res.json();
      return data.success ? data.data.account_name : null;
    },
    enabled: accountNumber.length === 10 && !!bankCode,
    staleTime: 1000 * 60 * 5,
  });

  const accountName = verifyData || manualAccountName;
  const isVerified = !!verifyData && accountNumber.length === 10 && !!bankCode;

  const filteredInstitutions = institutions.filter((inst: any) => 
    inst.name.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const handleContinue = () => {
    const params = new URLSearchParams({
      type,
      send,
      receive,
      token,
      currency,
      accNum: accountNumber,
      accName: accountName,
      bank: bankName,
      bankCode: bankCode,
    });
    router.push(`/cash-out/bank/confirm?${params.toString()}`);
  };

  return (
    <div className="min-h-screen bg-white flex flex-col">
      {/* Header */}
      <div className="px-5 pt-12 pb-4 flex items-center relative border-b border-gray-100/50 bg-white">
        <button
          onClick={() => router.back()}
          className="w-10 h-10 rounded-full flex items-center justify-center text-gray-900 hover:bg-gray-50 transition-colors"
        >
          <ChevronLeft size={24} />
        </button>
        <h1 className="absolute left-1/2 -translate-x-1/2 text-[18px] font-bold text-[#1C1C1C] whitespace-nowrap">
          {isBank ? 'Add bank account' : 'Add mobile money'}
        </h1>
      </div>

      <div className="flex-1 px-6 pt-10 space-y-8">
        {/* Bank Selection */}
        <div className="space-y-2">
          <label className="text-[16px] font-medium text-[#1C1C1C]">
            {isBank ? 'Select Bank' : 'Provider'}
          </label>
          <button
            onClick={() => setIsBankSheetOpen(true)}
            className="w-full h-[58px] px-4 rounded-[12px] border border-gray-200 bg-white flex items-center justify-between text-[16px] text-[#1C1C1C] hover:border-[#2261FE] transition-colors"
          >
            <span className={bankName ? 'text-[#1C1C1C]' : 'text-gray-400'}>
              {bankName || (isBank ? 'Choose a bank' : 'Choose a provider')}
            </span>
            <ChevronDown size={20} className="text-gray-400" />
          </button>
        </div>

        {/* Account Number */}
        <div className="space-y-2">
          <label className="text-[16px] font-medium text-[#1C1C1C]">
            {isBank ? 'Account number' : 'Phone number'}
          </label>
          <div className="relative">
            <input
              type="text"
              placeholder={isBank ? 'Enter 10-digit account number' : 'Enter phone number'}
              value={accountNumber}
              onChange={(e) => setAccountNumber(e.target.value.replace(/\D/g, '').slice(0, 10))}
              className="w-full h-[58px] px-4 rounded-[12px] border border-gray-200 bg-white text-[16px] text-[#1C1C1C] placeholder:text-gray-400 focus:outline-none focus:border-[#2261FE] transition-colors"
            />
            {isVerifying && (
              <div className="absolute right-4 top-1/2 -translate-y-1/2">
                <Loader2 size={20} className="text-[#2261FE] animate-spin" />
              </div>
            )}
            {isVerified && (
              <div className="absolute right-4 top-1/2 -translate-y-1/2">
                <CheckCircle2 size={20} className="text-green-500" />
              </div>
            )}
          </div>
        </div>

        {/* Account Name (Read-only if verified) */}
        <div className="space-y-2">
          <label className="text-[16px] font-medium text-[#1C1C1C]">
            Account name
          </label>
          <input
            type="text"
            placeholder="Account name will appear here"
            value={accountName}
            readOnly={isVerified}
            onChange={(e) => setManualAccountName(e.target.value)}
            className={`w-full h-[58px] px-4 rounded-[12px] border border-gray-200 text-[16px] text-[#1C1C1C] placeholder:text-gray-400 focus:outline-none transition-colors ${isVerified ? 'bg-gray-50 border-transparent' : 'bg-white focus:border-[#2261FE]'}`}
          />
        </div>
      </div>

      {/* Institution Selection Sheet */}
      {isBankSheetOpen && (
        <div className="fixed inset-0 z-[100] flex items-end justify-center">
          <div className="absolute inset-0 bg-black/40 backdrop-blur-[2px]" onClick={() => setIsBankSheetOpen(false)} />
          <div className="relative w-full max-w-[430px] h-[80vh] bg-white rounded-t-[30px] flex flex-col animate-in slide-in-from-bottom duration-300">
            <div className="p-6 flex items-center justify-between border-b border-gray-100">
              <h2 className="text-[20px] font-bold text-[#1C1C1C]">Select {isBank ? 'Bank' : 'Provider'}</h2>
              <button onClick={() => setIsBankSheetOpen(false)} className="p-2 bg-gray-50 rounded-full">
                <X size={20} className="text-gray-400" />
              </button>
            </div>
            
            <div className="p-4">
              <div className="relative">
                <Search size={18} className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-400" />
                <input
                  type="text"
                  placeholder="Search..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="w-full h-[50px] pl-11 pr-4 bg-gray-50 rounded-[15px] border-none focus:ring-2 focus:ring-[#2261FE]/20 outline-none text-[15px]"
                />
              </div>
            </div>

            <div className="flex-1 overflow-y-auto px-4 pb-10">
              {filteredInstitutions.map((inst) => (
                <button
                  key={inst.id}
                  onClick={() => {
                    setBankName(inst.name);
                    setBankCode(inst.code);
                    setIsBankSheetOpen(false);
                  }}
                  className="w-full p-4 flex items-center gap-4 hover:bg-gray-50 rounded-[15px] transition-colors border-b border-gray-50 last:border-none"
                >
                  <div className="w-10 h-10 rounded-full bg-blue-50 flex items-center justify-center text-[#2261FE] font-bold">
                    {inst.name.charAt(0)}
                  </div>
                  <span className="text-[16px] font-medium text-[#1C1C1C]">{inst.name}</span>
                </button>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Footer */}
      <div className="mt-auto p-6 pb-12 w-full flex justify-center">
        <button
          onClick={handleContinue}
          disabled={!isVerified && (!accountName || !accountNumber || !bankName)}
          className="w-full max-w-[390px] h-[65px] bg-[#2261FE] text-white text-[18px] font-bold shadow-lg shadow-[#2261FE]/20 active:scale-[0.98] transition-all flex items-center justify-center rounded-[7px] disabled:opacity-50"
        >
          Continue
        </button>
      </div>
    </div>
  );
}

export default function AddAccountPage() {
  return (
    <Suspense fallback={<div className="min-h-screen bg-white" />}>
      <AddAccountForm />
    </Suspense>
  );
}

