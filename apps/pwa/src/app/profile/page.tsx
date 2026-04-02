"use client";

import { 
  Home, 
  FileText, 
  User, 
  ChevronRight, 
  ShieldCheck, 
  HelpCircle, 
  LogOut, 
  Settings,
  Edit2
} from "lucide-react";
import Link from "next/link";
import React from "react";

export default function ProfilePage() {
  return (
    <div className="min-h-screen bg-[#F8FAFD] flex flex-col items-center">
      {/* Main PWA Container */}
      <div className="w-full max-w-[430px] flex flex-col min-h-screen relative pb-32">
        
        {/* Header Section */}
        <div className="pt-16 px-6 pb-8 flex flex-col items-center">
          <div className="w-full flex justify-between items-center mb-8">
            <h1 className="text-[20px] font-bold text-[#1C1C1C]">Profile</h1>
            <button className="p-2 hover:bg-gray-100 rounded-full transition-colors">
              <Settings size={22} className="text-[#1C1C1C]" />
            </button>
          </div>

          {/* User Info Card */}
          <div className="w-full flex items-center justify-between bg-white rounded-[24px] p-5 shadow-[0px_4px_25px_rgba(0,0,0,0.02)] border border-gray-100">
            <div className="flex items-center gap-4">
              {/* Avatar */}
              <div className="w-[64px] h-[64px] rounded-full bg-[#E0E7FF] flex items-center justify-center text-[#2261FE] font-bold text-xl border-2 border-white shadow-sm">
                JD
              </div>
              <div className="flex flex-col">
                <h2 className="text-[20px] font-bold text-[#1C1C1C]">Jane Doe</h2>
                <p className="text-[#6D6D6D] text-[15px] font-medium">+254 712 345 678</p>
              </div>
            </div>
            <button className="w-10 h-10 flex items-center justify-center bg-[#F8FAFD] rounded-full text-[#1C1C1C] active:scale-95 transition-all">
              <Edit2 size={18} />
            </button>
          </div>
        </div>

        {/* Stats Row */}
        <div className="px-6 mb-8">
          <div className="flex justify-between gap-3">
            {/* Total Sent */}
            <div className="flex-1 bg-white rounded-[20px] p-4 border border-gray-100 shadow-[0px_4px_15px_rgba(0,0,0,0.01)] flex flex-col items-center text-center">
              <div className="w-[45px] h-[45px] mb-3 flex items-center justify-center">
                <img src="/total sent.svg" alt="" className="w-full h-full object-contain" />
              </div>
              <p className="text-[#6D6D6D] text-[11px] font-semibold mb-1 uppercase tracking-wider">Total Sent</p>
              <h3 className="text-[#1C1C1C] text-[16px] font-bold leading-tight">$24,500</h3>
            </div>

            {/* Total Transactions */}
            <div className="flex-1 bg-white rounded-[20px] p-4 border border-gray-100 shadow-[0px_4px_15px_rgba(0,0,0,0.01)] flex flex-col items-center text-center">
              <div className="w-[45px] h-[45px] mb-3 flex items-center justify-center">
                <img src="/total transactions.svg" alt="" className="w-full h-full object-contain" />
              </div>
              <p className="text-[#6D6D6D] text-[11px] font-semibold mb-1 uppercase tracking-wider">Total Tx</p>
              <h3 className="text-[#1C1C1C] text-[16px] font-bold leading-tight">142</h3>
            </div>

            {/* Fees Paid */}
            <div className="flex-1 bg-white rounded-[20px] p-4 border border-gray-100 shadow-[0px_4px_15px_rgba(0,0,0,0.01)] flex flex-col items-center text-center">
              <div className="w-[45px] h-[45px] mb-3 flex items-center justify-center">
                <img src="/fees.svg" alt="" className="w-full h-full object-contain" />
              </div>
              <p className="text-[#6D6D6D] text-[11px] font-semibold mb-1 uppercase tracking-wider">Fees Paid</p>
              <h3 className="text-[#1C1C1C] text-[16px] font-bold leading-tight">$185.00</h3>
            </div>
          </div>
        </div>

        {/* Menu Section */}
        <div className="px-6 space-y-4">
          <h3 className="text-[#6D6D6D] text-[14px] font-bold uppercase tracking-widest px-1">Settings</h3>
          
          <div className="bg-white rounded-[24px] overflow-hidden border border-gray-100 shadow-[0px_4px_25px_rgba(0,0,0,0.02)]">
            <MenuButton 
              icon={<ShieldCheck size={20} className="text-[#10B981]" />} 
              label="Security Settings" 
              subLabel="Biometrics & PIN"
            />
            <div className="h-[1px] bg-gray-50 mx-5" />
            <MenuButton 
              icon={<HelpCircle size={20} className="text-[#2261FE]" />} 
              label="Contact Support" 
              subLabel="Help Center & Chat"
            />
            <div className="h-[1px] bg-gray-50 mx-5" />
            <MenuButton 
              icon={<div className="w-5 h-5"><img src="/export.svg" alt="" className="w-full h-full" /></div>} 
              label="Export History" 
              subLabel="Download PDF/CSV"
            />
          </div>

          <div className="pt-2">
            <button className="w-full flex items-center justify-between bg-white rounded-[20px] p-5 border border-red-50 group hover:bg-red-50/30 transition-all">
              <div className="flex items-center gap-4">
                <div className="w-10 h-10 rounded-full bg-red-50 flex items-center justify-center text-red-500 group-hover:bg-red-100 transition-colors">
                  <LogOut size={20} />
                </div>
                <div className="flex flex-col text-left">
                  <span className="text-[17px] font-bold text-[#1C1C1C]">Logout</span>
                  <span className="text-[13px] text-red-400 font-medium whitespace-nowrap">End your current session</span>
                </div>
              </div>
              <ChevronRight size={18} className="text-gray-300" />
            </button>
          </div>
        </div>

        {/* Bottom Navigation */}
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-50 w-full px-5 flex justify-center max-w-[430px]">
          <div 
            className="w-full max-w-[320px] bg-[#D8E9FF] rounded-[70px] py-[15px] px-[30px] flex items-center justify-between shadow-[0px_4px_4px_0px_#00000040]"
            style={{ height: "75px" }}
          >
            <Link 
              href="/home" 
              className="flex flex-col items-center gap-1 text-[#1C1C1C]/40 hover:text-[#1C1C1C] transition-colors"
            >
              <Home size={28} />
              <span className="font-semibold text-[13px]">Home</span>
            </Link>
            <Link 
              href="/history" 
              className="flex flex-col items-center gap-1 text-[#1C1C1C]/40 hover:text-[#1C1C1C] transition-colors"
            >
              <FileText size={28} />
              <span className="font-semibold text-[13px]">History</span>
            </Link>
            <Link 
              href="/profile" 
              className="flex flex-col items-center gap-1 text-[#1C1C1C]"
            >
              <User size={28} />
              <span className="font-semibold text-[13px]">Profile</span>
            </Link>
          </div>
        </div>

      </div>
    </div>
  );
}

function MenuButton({ icon, label, subLabel }: { icon: React.ReactNode, label: string, subLabel: string }) {
  return (
    <button className="w-full flex items-center justify-between p-5 hover:bg-gray-50 transition-colors group">
      <div className="flex items-center gap-4">
        <div className="w-10 h-10 rounded-full bg-[#f8fafd] flex items-center justify-center text-[#1C1C1C] group-hover:scale-110 transition-transform">
          {icon}
        </div>
        <div className="flex flex-col text-left">
          <span className="text-[17px] font-bold text-[#1C1C1C]">{label}</span>
          <span className="text-[13px] text-[#6D6D6D] font-medium whitespace-nowrap">{subLabel}</span>
        </div>
      </div>
      <ChevronRight size={18} className="text-gray-300 group-hover:text-[#1C1C1C] transition-colors" />
    </button>
  );
}
