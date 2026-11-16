import React, { useEffect, useState } from 'react';
import { useRegisterSW } from 'virtual:pwa-register/react';
import { Download, Share, PlusSquare, RefreshCw, Smartphone, CheckCircle2 } from 'lucide-react';
import { Button, Modal } from './ui';

export function useInstall() {
  const [prompt, setPrompt] = useState(null);
  const [installed, setInstalled] = useState(
    window.matchMedia('(display-mode: standalone)').matches || navigator.standalone === true
  );
  useEffect(() => {
    const before = (e) => {
      e.preventDefault();
      setPrompt(e);
    };
    const done = () => {
      setInstalled(true);
      setPrompt(null);
    };
    window.addEventListener('beforeinstallprompt', before);
    window.addEventListener('appinstalled', done);
    return () => {
      window.removeEventListener('beforeinstallprompt', before);
      window.removeEventListener('appinstalled', done);
    };
  }, []);
  return {
    prompt,
    installed,
    install: async () => {
      if (!prompt) return false;
      await prompt.prompt();
      const result = await prompt.userChoice;
      setPrompt(null);
      return result.outcome === 'accepted';
    },
  };
}

export function InstallModal({ onClose, installation }) {
  const ios =
    /iPad|iPhone|iPod/.test(navigator.userAgent) ||
    (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
  return (
    <Modal title="Rumah Mew di layar utama" onClose={onClose}>
      <div className="mb-5 flex items-center gap-4 rounded-2xl bg-[#f4eddf] p-5">
        <img src="/icons/icon-192.png" alt="Ikon FindMew" className="h-16 w-16 rounded-2xl" />
        <div>
          <h3 className="font-extrabold">FindMew</h3>
          <p className="mt-1 text-xs text-muted">Temukan. Abadikan. Sayangi.</p>
        </div>
      </div>
      {installation.installed ? (
        <p className="flex items-center gap-2 text-sm text-[#879b70]">
          <CheckCircle2 size={19} />
          FindMew sudah terpasang.
        </p>
      ) : installation.prompt ? (
        <Button
          className="w-full"
          onClick={async () => {
            await installation.install();
            onClose();
          }}
        >
          <Download size={17} />
          Pasang FindMew
        </Button>
      ) : (
        <>
          <p className="mb-4 text-sm leading-7 text-muted">
            {ios
              ? 'Buka FindMew di Safari, lalu ikuti langkah berikut:'
              : 'Buka menu browser Chrome atau Edge, lalu pilih “Instal aplikasi” atau “Tambahkan ke layar utama”.'}
          </p>
          {ios && (
            <ol className="space-y-3 text-sm">
              <li className="flex items-center gap-3 rounded-xl bg-[#f6f5ed] p-4">
                <Share size={19} className="text-[#9ba888]" />
                1. Ketuk Bagikan di bilah Safari.
              </li>
              <li className="flex items-center gap-3 rounded-xl bg-[#f6f5ed] p-4">
                <PlusSquare size={19} className="text-[#9ba888]" />
                2. Pilih “Add to Home Screen”.
              </li>
              <li className="flex items-center gap-3 rounded-xl bg-[#f6f5ed] p-4">
                <Smartphone size={19} className="text-[#9ba888]" />
                3. Ketuk “Add” untuk memasang.
              </li>
            </ol>
          )}
        </>
      )}
      <p className="mt-5 text-[11px] leading-6 text-muted">
        Pemasangan memerlukan kunjungan online melalui HTTPS atau localhost. Setelah terpasang, app
        shell dan koleksi yang sudah tersimpan dapat dibuka offline.
      </p>
    </Modal>
  );
}

export function UpdateNotice() {
  const {
    offlineReady: [offlineReady, setOfflineReady],
    needRefresh: [needRefresh, setNeedRefresh],
    updateServiceWorker,
  } = useRegisterSW({
    onRegisteredSW(_, registration) {
      if (registration) {
        if (navigator.onLine) registration.update().catch(() => {});
        setInterval(() => {
          if (navigator.onLine) registration.update().catch(() => {});
        }, 3600000);
      }
    },
  });
  if (!needRefresh && !offlineReady) return null;
  return (
    <div
      role="status"
      className="fixed inset-x-4 bottom-28 z-[900] mx-auto flex max-w-md items-center gap-3 rounded-2xl border border-[#dbddc9] bg-[#fffdf6] p-4 shadow-xl"
    >
      <RefreshCw size={20} className="shrink-0 text-[#a4af8e]" />
      <p className="flex-1 text-xs font-bold">
        {needRefresh
          ? 'Versi baru FindMew sudah siap. Selesaikan perubahan sebelum memuat ulang.'
          : 'FindMew siap dibuka offline. Koleksi yang sudah dimuat akan tersimpan di perangkat ini.'}
      </p>
      {needRefresh ? (
        <>
          <button
            onClick={() => updateServiceWorker(true)}
            className="text-xs font-extrabold text-[#b98c63]"
          >
            Perbarui
          </button>
          <button onClick={() => setNeedRefresh(false)} className="text-xs text-muted">
            Nanti
          </button>
        </>
      ) : (
        <button
          onClick={() => setOfflineReady(false)}
          className="text-xs font-extrabold text-[#b98c63]"
        >
          Oke
        </button>
      )}
    </div>
  );
}
