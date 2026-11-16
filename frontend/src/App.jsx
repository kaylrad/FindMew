import React, { Suspense, lazy, useState, useEffect } from 'react';
import {
  PawPrint,
  Camera,
  Images,
  MapPin,
  UserRound,
  Bell,
  Plus,
  WifiOff,
  Download,
  Heart,
  LoaderCircle,
  RefreshCw,
} from 'lucide-react';
import { useApp } from './context';
import Brand from './components/layout/Brand';
import AuthScreen from './components/auth/AuthScreen';
import MewHomeHeader from './components/layout/MewHomeHeader';
import { Button, Coin, Modal, Toast } from './components/ui';
import { useInstall, InstallModal, UpdateNotice } from './components/PWA';
import Home from './pages/Home';
import MapLoadBoundary from './components/MapLoadBoundary';
import PageLoadBoundary from './components/PageLoadBoundary';
const Collection = lazy(() => import('./pages/Collection'));
const CollectionDetail = lazy(() =>
  import('./pages/Collection').then((module) => ({ default: module.CollectionDetail }))
);
const Capture = lazy(() => import('./pages/Capture'));
const Store = lazy(() => import('./pages/Store'));
const Profile = lazy(() => import('./pages/Profile'));
const MapPage = lazy(() => import('./pages/MapPage'));
const pages = {
  mymew: 'home',
  koleksi: 'collection',
  tambah: 'add',
  map: 'map',
  profil: 'profile',
  store: 'store',
};
const hashes = Object.fromEntries(Object.entries(pages).map(([k, v]) => [v, k]));
export default function App() {
  const { config, session, data, loading, error, online, cached, savedAt, refresh } = useApp(),
    [page, setPage] = useState(pages[location.hash.slice(1)] || 'home'),
    [detail, setDetail] = useState(null),
    [install, setInstall] = useState(false),
    [notifications, setNotifications] = useState(false),
    [storeProductId, setStoreProductId] = useState(null),
    [mapFocusId, setMapFocusId] = useState(null);
  const installation = useInstall();
  function navigate(p, options = {}) {
    setMapFocusId(p === 'map' ? options.collectionId || null : null);
    setStoreProductId(p === 'store' ? options.productId || null : null);
    setDetail(null);
    location.hash = hashes[p] || 'mymew';
    setPage(p);
    window.scrollTo({ top: 0, behavior: 'instant' });
  }
  useEffect(() => {
    const fn = () => {
      setDetail(null);
      setPage(pages[location.hash.slice(1)] || 'home');
    };
    window.addEventListener('hashchange', fn);
    return () => window.removeEventListener('hashchange', fn);
  }, []);
  useEffect(() => {
    setDetail(null);
    setNotifications(false);
    setStoreProductId(null);
    setMapFocusId(null);
  }, [session?.user.id]);
  const nav = [
    ['home', 'MyMew', PawPrint],
    ['collection', 'Koleksi', Images],
    ['add', 'Tambah', Camera],
    ['map', 'Map', MapPin],
    ['profile', 'Profil', UserRound],
  ];
  return (
    <div className={data && page === 'home' ? 'mew-home-shell' : 'min-h-dvh'}>
      <header className="sticky top-0 z-[700] border-b border-[#eeece2] bg-[#fbfaf5]/95 backdrop-blur-lg">
        {data && page === 'home' ? (
          <MewHomeHeader
            coins={data.profile.coins}
            navigate={navigate}
            onNotifications={() => setNotifications(true)}
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
                      onClick={() => setNotifications(true)}
                    >
                      <Bell size={19} strokeWidth={1.5} />
                      <span className="absolute right-2 top-1.5 h-1 w-1 rounded-full bg-[#dda987]" />
                    </button>
                  </>
                )}
                {!data && (
                  <button
                    aria-label="Panduan instalasi"
                    className="icon-button"
                    onClick={() => setInstall(true)}
                  >
                    <Download size={18} />
                  </button>
                )}
              </div>
            </div>
          </>
        )}
      </header>
      {config?.demo && (
        <div className="border-b border-[#eeece2] bg-[#f6f1e3] py-1.5 text-center text-[9px] tracking-wide text-[#a8966d] sm:hidden">
          MODE DEMO LOKAL · belum terhubung Supabase
        </div>
      )}
      {!online && (
        <div
          role="status"
          className="border-b border-[#e6dab7] bg-[#f7efda] px-5 py-2.5 text-center text-[11px] leading-5 text-[#9c875a]"
        >
          <WifiOff size={13} className="mr-2 inline" />
          Kamu offline.{' '}
          {cached
            ? 'Menampilkan data tersimpan yang mungkin belum terbaru.'
            : 'Hubungkan internet untuk memuat data.'}{' '}
          Aksi yang perlu server dinonaktifkan.
        </div>
      )}
      {online && cached && (
        <div
          role="status"
          className="bg-[#f4edda] px-5 py-2 text-center text-[11px] text-[#a38c5c]"
        >
          Data tersimpan {savedAt ? new Date(savedAt).toLocaleString('id-ID') : ''} · belum dapat
          diperbarui.
        </div>
      )}
      {loading && !data ? (
        <div className="flex min-h-[60vh] flex-col items-center justify-center gap-4 text-muted">
          <LoaderCircle size={29} className="animate-spin text-[#b0b99a]" />
          <p className="text-xs">Menyiapkan rumah Mew...</p>
        </div>
      ) : !config ? (
        <div className="mx-auto max-w-md p-10 text-center">
          <p className="text-sm leading-7">{error || 'Konfigurasi belum tersedia.'}</p>
          <Button className="mt-5" onClick={() => location.reload()}>
            <RefreshCw size={15} />
            Coba lagi
          </Button>
        </div>
      ) : !session ? (
        <AuthScreen />
      ) : (
        <main
          id="main"
          className={
            page === 'home'
              ? 'mew-home-main'
              : 'mx-auto max-w-[1120px] px-5 pt-7 pb-36 md:px-9 md:pt-9'
          }
        >
          {error && (
            <div
              role="alert"
              className="mb-6 flex items-center justify-between gap-3 rounded-xl border border-[#eedacb] bg-[#fff0e5] p-4 text-xs leading-6 text-[#ad8065]"
            >
              {error}
              <button onClick={refresh} className="shrink-0 font-extrabold underline">
                Coba lagi
              </button>
            </div>
          )}
          {data ? (
            <PageLoadBoundary key={page}>
              <Suspense
                fallback={
                  <div className="grid h-96 place-items-center text-muted">
                    Menyiapkan halaman...
                  </div>
                }
              >
                {page === 'home' ? (
                  <Home navigate={navigate} openCollection={setDetail} />
                ) : page === 'collection' ? (
                  <Collection navigate={navigate} openCollection={setDetail} />
                ) : page === 'add' ? (
                  <Capture navigate={navigate} />
                ) : page === 'map' ? (
                  <MapLoadBoundary>
                    <MapPage focusId={mapFocusId} />
                  </MapLoadBoundary>
                ) : page === 'store' ? (
                  <Store navigate={navigate} initialProductId={storeProductId} />
                ) : (
                  <Profile navigate={navigate} openInstall={() => setInstall(true)} />
                )}
              </Suspense>
            </PageLoadBoundary>
          ) : (
            <div className="py-20 text-center text-sm text-muted">
              Belum dapat memuat rumah Mew.
              <Button className="mx-auto mt-5" onClick={refresh}>
                Coba lagi
              </Button>
            </div>
          )}
        </main>
      )}
      {session && (
        <nav aria-label="Navigasi utama" className="bottom-nav">
          {nav.map(([id, label, Icon]) => (
            <button
              key={id}
              aria-current={page === id ? 'page' : undefined}
              onClick={() => navigate(id)}
              className={`nav-item ${page === id ? 'nav-active' : ''} ${id === 'add' ? 'nav-camera' : ''}`}
            >
              <span className={id === 'add' ? 'camera-disc' : ''}>
                <Icon size={id === 'add' ? 24 : 21} strokeWidth={1.7} />
              </span>
              <span>{label}</span>
              {page === id && id !== 'add' && <i />}
            </button>
          ))}
        </nav>
      )}
      {detail && (
        <Suspense fallback={null}>
          <CollectionDetail key={detail.id} item={detail} onClose={() => setDetail(null)} />
        </Suspense>
      )}
      {install && <InstallModal installation={installation} onClose={() => setInstall(false)} />}
      {notifications && (
        <Modal title="Kabar dari rumah Mew" onClose={() => setNotifications(false)}>
          <div className="mb-5 flex h-14 w-14 items-center justify-center rounded-2xl bg-[#f1e8d6] text-[#baa375]">
            <Heart size={25} />
          </div>
          <h3 className="font-extrabold">Mochi senang kamu di sini.</h3>
          <p className="mt-3 text-sm leading-7 text-muted">
            Belum ada notifikasi baru. Beri sedikit perhatian untuk MyMew atau temukan teman berbulu
            di sekitarmu.
          </p>
          <Button
            className="mt-6 w-full"
            variant="secondary"
            onClick={() => {
              setNotifications(false);
              navigate('add');
            }}
          >
            Temukan Mew <Camera size={16} />
          </Button>
        </Modal>
      )}
      <Toast />
      <UpdateNotice />
    </div>
  );
}
