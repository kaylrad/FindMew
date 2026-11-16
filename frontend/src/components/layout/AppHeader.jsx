import React from 'react';
import { Bell, Download, PawPrint, Plus } from 'lucide-react';
import { Coin } from '../ui';
import { mewUiAssets } from '../../lib/mymew-catalog';

export default function AppHeader({ config, data, page, navigate, onNotifications, onInstall }) {
  return (
    <header className="sticky top-0 z-[700] border-b border-[#eeece2] bg-[#fbfaf5]/95 backdrop-blur-lg">
      {data && page === 'home' ? (
        <MewHomeHeader
          coins={data.profile.coins}
          navigate={navigate}
          onNotifications={onNotifications}
        />
      ) : (
        <>
          <div className="mx-auto flex h-[76px] max-w-[1120px] items-center justify-between gap-3 px-5 md:px-9">
            <Brand onClick={() => navigate('home')} />
            <div className="flex items-center gap-2.5 md:gap-4">
              {config?.demo && (
                <span className="hidden rounded-full border border-[#e9dfc5] px-2.5 py-1 text-[9px] font-bold tracking-wide text-[#b19a67] sm:inline-block">
                  DEMO LOKAL
                </span>
              )}
              {data && (
                <>
                  <button
                    onClick={() => navigate('store')}
                    className="flex items-center gap-2 rounded-full border border-[#eee5ce] bg-[#f8f2e2] py-2 pl-3 pr-1.5"
                    aria-label={`Saldo ${data.profile.coins} koin, buka Store`}
                  >
                    <Coin value={data.profile.coins} className="text-xs" />
                    <span className="ml-1 grid h-5 w-5 place-items-center rounded-full bg-[#eee3c8] text-[#baa16a]">
                      <Plus size={12} />
                    </span>
                  </button>
                  <button
                    aria-label="Notifikasi"
                    className="icon-button relative"
                    onClick={onNotifications}
                  >
                    <Bell size={19} strokeWidth={1.5} />
                    <span className="absolute right-2 top-1.5 h-1 w-1 rounded-full bg-[#dda987]" />
                  </button>
                </>
              )}
              {!data && (
                <button aria-label="Panduan instalasi" className="icon-button" onClick={onInstall}>
                  <Download size={18} />
                </button>
              )}
            </div>
          </div>
        </>
      )}
    </header>
  );
}

function Brand({ onClick }) {
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

function MewHomeHeader({ coins, navigate, onNotifications }) {
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
