import React from 'react';
import { mewUiAssets } from '../../lib/mymew-catalog';
export default function MewHomeHeader({ coins, navigate, onNotifications }) {
  return (
    <div className="mx-auto flex h-[76px] max-w-[453px] items-center justify-between gap-3 px-[21px]">
      <button
        onClick={() => navigate('home')}
        aria-label="FindMew beranda"
        className="flex items-center gap-[7px]"
      >
        <span className="grid h-[33px] w-[32px] rotate-[-5deg] place-items-center rounded-t-[10px] rounded-br-[10px] rounded-bl-[4px] bg-[#efc1a4]">
          <img src={mewUiAssets.brand} alt="" width="21" height="21" />
        </span>
        <span className="text-[27px] font-black leading-[27px] tracking-[-1.5px] text-[#41473b]">
          find<span className="text-[#d89170]">mew</span>
        </span>
      </button>
      <div className="flex items-center gap-[15px]">
        <button
          onClick={() => navigate('store')}
          aria-label={'Saldo ' + coins + ' koin, buka Store'}
          className="flex items-center gap-1 rounded-[25px] border border-[#f0e6cf] bg-[#fcf5e5] px-[7px] py-[6px]"
        >
          <img src={mewUiAssets.coin} alt="" width="19" height="22" />
          <strong className="text-[11px] leading-[16.5px] text-[#917245]">{coins}</strong>
          <span className="text-[8px] leading-3 text-[#b3a185]">koin</span>
          <span className="ml-1 grid size-[17px] place-items-center rounded-full bg-[#f1e3c5]">
            <img src={mewUiAssets.plus} alt="" width="14" height="14" />
          </span>
        </button>
        <button
          onClick={onNotifications}
          aria-label="Notifikasi"
          className="relative grid h-10 w-8 place-items-center rounded-full"
        >
          <img src={mewUiAssets.bell} alt="" width="20" height="21" />
          <span className="absolute right-[6px] top-[7px] size-[7px] rounded-full border-[1.6px] border-[#fcfbf7] bg-[#d89978]" />
        </button>
      </div>
    </div>
  );
}
