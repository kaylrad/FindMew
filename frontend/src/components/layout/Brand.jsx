import React from 'react';
import { PawPrint } from 'lucide-react';
export default function Brand({ onClick }) {
  return (
    <button
      aria-label="FindMew beranda"
      onClick={onClick}
      className="flex shrink-0 items-center gap-2 md:gap-2.5"
    >
      <span className="relative grid h-8 w-8 rotate-[-7deg] place-items-center rounded-[10px] bg-[#e7b392] text-[#fff9ee] md:h-9 md:w-9">
        <PawPrint size={21} fill="currentColor" strokeWidth={1.5} />
      </span>
      <span className="text-[21px] font-black tracking-[-1.3px] text-[#4b5140] md:text-[24px]">
        find<span className="text-[#d59b75]">mew</span>
        <span className="ml-0.5 text-sm text-[#d59b75]">.</span>
      </span>
    </button>
  );
}
