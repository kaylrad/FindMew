import React, { Suspense, lazy, useState, useEffect } from 'react';
import {
  PawPrint,
  Camera,
  Images,
  MapPin,
  UserRound,
  WifiOff,
  Heart,
  LoaderCircle,
  RefreshCw,
} from 'lucide-react';
import { useApp } from './context';
import AppHeader from './components/layout/AppHeader';
import AuthScreen from './components/auth/AuthScreen';
import { Button, Modal, Toast } from './components/ui';
import { useInstall, InstallModal, UpdateNotice } from './components/PWA';
import Home from './pages/Home';
import PageLoadBoundary from './components/PageLoadBoundary';

const Collection = lazy(() => import('./pages/Collection'));
const CollectionDetail = lazy(() =>
  import('./pages/Collection').then((module) => ({ default: module.CollectionDetail }))
);
const Capture = lazy(() => import('./pages/Capture'));
const Store = lazy(() => import('./pages/Store'));
const Profile = lazy(() => import('./pages/Profile'));
const MapPage = lazy(() => import('./pages/MapPage'));
const pageByHash = {
  mymew: 'home',
  koleksi: 'collection',
  tambah: 'add',
  map: 'map',
  profil: 'profile',
  store: 'store',
};
const hashByPage = Object.fromEntries(Object.entries(pageByHash).map(([k, v]) => [v, k]));
const navigationItems = [
  ['home', 'MyMew', PawPrint],
  ['collection', 'Koleksi', Images],
  ['add', 'Tambah', Camera],
  ['map', 'Map', MapPin],
  ['profile', 'Profil', UserRound],
];

function PageContent({ page, navigate, openCollection, mapFocusId, storeProductId, openInstall }) {
  switch (page) {
    case 'home':
      return <Home navigate={navigate} />;
    case 'collection':
      return <Collection navigate={navigate} openCollection={openCollection} />;
    case 'add':
      return <Capture navigate={navigate} />;
    case 'map':
      return <MapPage focusId={mapFocusId} />;
    case 'store':
      return <Store navigate={navigate} initialProductId={storeProductId} />;
    default:
      return <Profile openInstall={openInstall} />;
  }
}

export default function App() {
  const { config, session, data, loading, error, online, cached, savedAt, refresh } = useApp();
  const [page, setPage] = useState(pageByHash[location.hash.slice(1)] || 'home');
  const [detail, setDetail] = useState(null);
  const [install, setInstall] = useState(false);
  const [notifications, setNotifications] = useState(false);
  const [storeProductId, setStoreProductId] = useState(null);
  const [mapFocusId, setMapFocusId] = useState(null);
  const installation = useInstall();
  function navigate(p, options = {}) {
    setMapFocusId(p === 'map' ? options.collectionId || null : null);
    setStoreProductId(p === 'store' ? options.productId || null : null);
    setDetail(null);
    location.hash = hashByPage[p] || 'mymew';
    setPage(p);
    window.scrollTo({ top: 0, behavior: 'instant' });
  }
  useEffect(() => {
    const fn = () => {
      setDetail(null);
      setPage(pageByHash[location.hash.slice(1)] || 'home');
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
  return (
    <div className={data && page === 'home' ? 'mew-home-shell' : 'min-h-dvh'}>
      <AppHeader
        config={config}
        data={data}
        page={page}
        navigate={navigate}
        onNotifications={() => setNotifications(true)}
        onInstall={() => setInstall(true)}
      />
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
            <PageLoadBoundary key={page} page={page}>
              <Suspense
                fallback={
                  <div className="grid h-96 place-items-center text-muted">
                    Menyiapkan halaman...
                  </div>
                }
              >
                <PageContent
                  page={page}
                  navigate={navigate}
                  openCollection={setDetail}
                  mapFocusId={mapFocusId}
                  storeProductId={storeProductId}
                  openInstall={() => setInstall(true)}
                />
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
          {navigationItems.map(([id, label, Icon]) => (
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
