import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  LocateFixed,
  MapPin,
  Lock,
  CalendarDays,
  Navigation,
  LoaderCircle,
  ExternalLink,
} from 'lucide-react';
import { useApp } from '../context';
import { request } from '../lib/api';
import { Photo, Button, Modal, dateLabel } from '../components/ui';
import ExplorerMap from '../components/ExplorerMap';

const initialMapState = { state: 'loading', message: '', loaded: false };
const externalLocation = (item) =>
  'https://www.openstreetmap.org/?mlat=' +
  encodeURIComponent(item.latitude) +
  '&mlon=' +
  encodeURIComponent(item.longitude) +
  '#map=17/' +
  encodeURIComponent(item.latitude) +
  '/' +
  encodeURIComponent(item.longitude);

export default function MapPage({ focusId = null }) {
  const { online, notify } = useApp();
  const [items, setItems] = useState([]),
    [selected, setSelected] = useState(null),
    [position, setPosition] = useState(null);
  const [loading, setLoading] = useState(true),
    [error, setError] = useState(''),
    [total, setTotal] = useState(0),
    [locating, setLocating] = useState(false);
  const [mapState, setMapState] = useState(initialMapState),
    [mapAttempt, setMapAttempt] = useState(0);
  const detailRequest = useRef(null),
    focused = useRef(null);
  const onMapStatus = useCallback(
    (status) =>
      setMapState((current) =>
        current.state === status.state &&
        current.message === status.message &&
        current.loaded === status.loaded
          ? current
          : status
      ),
    []
  );

  async function load(append = false, signal) {
    setLoading(true);
    try {
      const result = await request(`/explore/map?limit=100&offset=${append ? items.length : 0}`, {
        signal,
      });
      setItems((current) => (append ? [...current, ...result.items] : result.items));
      setTotal(result.total);
      setError('');
      if (!append)
        setSelected((current) =>
          result.items.some((item) => item.id === current?.id) ? current : null
        );
    } catch (failure) {
      if (failure.name !== 'AbortError') setError(failure.message);
    } finally {
      if (!signal?.aborted) setLoading(false);
    }
  }
  useEffect(() => {
    const controller = new AbortController();
    if (online) load(false, controller.signal);
    else {
      setError('Map membutuhkan internet untuk memuat peta dan pertemuan terbaru.');
      setLoading(false);
    }
    return () => controller.abort();
  }, [online]);
  useEffect(() => () => detailRequest.current?.abort(), []);
  useEffect(() => {
    if (!focusId || focused.current === focusId) return;
    const item = items.find((entry) => entry.id === focusId);
    if (item) {
      focused.current = focusId;
      openItem(item);
    }
  }, [items, focusId]);

  async function openItem(item) {
    detailRequest.current?.abort();
    const controller = new AbortController();
    detailRequest.current = controller;
    setSelected({ ...item, pending: true });
    try {
      const detail = await request('/explore/map/' + item.id, { signal: controller.signal });
      if (!controller.signal.aborted)
        setSelected((current) => (current?.id === item.id ? detail : current));
    } catch (failure) {
      if (failure.name !== 'AbortError')
        setSelected((current) =>
          current?.id === item.id
            ? { ...current, pending: false, detailError: failure.message }
            : current
        );
    }
  }
  function closeDetail() {
    detailRequest.current?.abort();
    setSelected(null);
  }

  function locate() {
    if (!navigator.geolocation) {
      notify('Lokasi belum tersedia di browser ini.', 'error');
      return;
    }
    setLocating(true);
    navigator.geolocation.getCurrentPosition(
      (value) => {
        setPosition([value.coords.longitude, value.coords.latitude]);
        setLocating(false);
      },
      () => {
        setLocating(false);
        notify('Lokasi belum diberikan. Kamu tetap bisa menjelajahi map.', 'error');
      },
      { timeout: 10000, maximumAge: 60000 }
    );
  }
  function retryMap() {
    setMapState(initialMapState);
    setMapAttempt((value) => value + 1);
  }
  const mapFailed = mapState.state === 'error' || mapState.state === 'unsupported';
  const mapUnavailable =
    mapState.state === 'unsupported' || (mapState.state === 'error' && !mapState.loaded);

  return (
    <>
      <p className="eyebrow">ADA BANYAK MEW DI LUAR SANA</p>
      <h1 className="page-title mt-3">Jejak teman berbulu</h1>
      <p className="mt-2 text-sm leading-6 text-muted">
        Jejak koleksimu dan pertemuan publik penjelajah lain. Tekan pin untuk mengenal kucingnya.
      </p>
      <div
        className="relative mt-7 h-[58dvh] min-h-[380px] overflow-hidden rounded-[24px] border border-line bg-[#e8eddf]"
        data-map-state={online ? mapState.state : 'offline'}
      >
        {online ? (
          <ExplorerMap
            items={items}
            focusId={focusId}
            position={position}
            attempt={mapAttempt}
            onSelect={openItem}
            onStatus={onMapStatus}
          />
        ) : (
          <div className="flex h-full flex-col items-center justify-center px-8 text-center">
            <MapPin size={38} className="mb-4 text-[#9aa88c]" />
            <p className="text-sm text-muted">Map tersedia saat kamu kembali online.</p>
          </div>
        )}
        {online && mapUnavailable && (
          <div className="absolute inset-0 z-20 flex flex-col items-center justify-center gap-4 bg-[#e8eddf]/95 px-7 text-center">
            <MapPin size={38} className="text-[#8d9d7c]" />
            <p className="max-w-sm text-sm leading-6 text-[#737f66]">{mapState.message}</p>
            <Button variant="secondary" onClick={retryMap}>
              Muat ulang peta
            </Button>
          </div>
        )}
        <button
          type="button"
          onClick={locate}
          disabled={!online || locating || mapState.state === 'unsupported'}
          aria-label="Lokasi saya"
          className="absolute bottom-8 right-4 z-30 rounded-xl border border-line bg-white p-3 text-[#8c9b79] shadow-lg disabled:opacity-45"
        >
          {locating ? (
            <LoaderCircle size={21} className="animate-spin" />
          ) : (
            <LocateFixed size={21} />
          )}
        </button>
        {online && !mapFailed && (loading || mapState.state === 'loading') && (
          <div
            role="status"
            className="absolute left-1/2 top-4 z-30 flex -translate-x-1/2 items-center gap-2 whitespace-nowrap rounded-full bg-white px-4 py-2 text-xs shadow-sm"
          >
            <LoaderCircle size={13} className="animate-spin" />
            {loading ? 'Mencari jejak Mew...' : 'Memuat peta...'}
          </div>
        )}
      </div>
      {selected && (
        <Modal title={'Detail kucing ' + selected.name} onClose={closeDetail}>
          {selected.pending ? (
            <p role="status" className="flex items-center gap-2 py-10 text-sm text-muted">
              <LoaderCircle size={18} className="animate-spin" />
              Memuat cerita kucing...
            </p>
          ) : selected.detailError ? (
            <div role="alert">
              <p className="text-sm leading-6 text-muted">{selected.detailError}</p>
              <Button className="mt-4" variant="secondary" onClick={() => openItem(selected)}>
                Coba lagi
              </Button>
            </div>
          ) : (
            <>
              <div className="aspect-[1.15] overflow-hidden rounded-2xl">
                <Photo item={selected} publicPhoto={!selected.owned} />
              </div>
              <h2 className="mt-5 text-xl font-extrabold">{selected.name}</h2>
              <p className="mt-2 text-xs text-muted">
                {selected.avatar} Ditemukan {selected.owned ? 'olehmu' : selected.uploader}
              </p>
              <div className="mt-4 flex flex-wrap gap-3 text-[11px] text-muted">
                <span className="flex items-center gap-1.5">
                  <CalendarDays size={13} />
                  {dateLabel(selected.created_at)}
                </span>
                <span className="flex items-center gap-1.5">
                  {selected.visibility === 'private' ? <Lock size={13} /> : <MapPin size={13} />}{' '}
                  {selected.visibility === 'private' ? 'Privat · hanya kamu' : 'Jejak publik'}
                </span>
              </div>
              <p className="mt-4 whitespace-pre-wrap text-sm leading-7">
                {selected.notes || 'Sebuah pertemuan kecil yang layak dikenang. ♡'}
              </p>
              <p className="mt-4 rounded-xl bg-[#f3f4e9] px-3 py-2 text-xs leading-6 text-[#818b72]">
                {selected.fed
                  ? 'Sudah diberi makan saat pertemuan ini.'
                  : 'Belum diberi makan saat pertemuan ini.'}
              </p>
              <p className="mt-4 flex items-center gap-2 text-xs text-muted">
                <MapPin size={14} />
                {selected.latitude.toFixed(3)}, {selected.longitude.toFixed(3)}
              </p>
              <a
                href={externalLocation(selected)}
                target="_blank"
                rel="noopener noreferrer"
                className="mt-4 inline-flex items-center gap-2 text-xs font-bold text-[#7a8d67]"
              >
                Buka lokasi
                <ExternalLink size={13} />
              </a>
            </>
          )}
          <Button
            className="mt-6 w-full"
            variant="secondary"
            aria-label="Tutup detail map"
            onClick={closeDetail}
          >
            Kembali ke peta
          </Button>
        </Modal>
      )}
      {online && mapFailed && !mapUnavailable && (
        <div
          role="alert"
          className="mt-4 flex items-center justify-between gap-3 rounded-xl bg-[#f5eadb] p-4 text-xs leading-6 text-[#a38a69]"
        >
          <span>{mapState.message}</span>
          <button type="button" onClick={retryMap} className="shrink-0 font-bold underline">
            Muat ulang peta
          </button>
        </div>
      )}
      {error ? (
        <div
          role="alert"
          className="mt-4 flex items-center justify-between gap-3 rounded-xl bg-[#f5eadb] p-4 text-xs leading-6 text-[#a38a69]"
        >
          {error}
          {online && (
            <button
              type="button"
              onClick={() => load()}
              disabled={loading}
              className="shrink-0 font-bold underline"
            >
              Coba lagi
            </button>
          )}
        </div>
      ) : (
        <p className="mt-4 flex items-center gap-2 text-xs text-muted">
          <Navigation size={13} />
          {total} jejak · Koleksi privatmu hanya terlihat olehmu.
        </p>
      )}
      {online && mapFailed && items.length > 0 && (
        <section className="mt-5" aria-label="Daftar pertemuan di peta">
          <h2 className="mb-3 text-sm font-extrabold">Jejak yang bisa kamu buka</h2>
          <div className="grid gap-3 sm:grid-cols-2">
            {items.map((item) => (
              <article
                key={item.id}
                className="flex items-center justify-between gap-3 rounded-xl border border-line bg-[#fffdf7] p-4"
              >
                <button type="button" onClick={() => openItem(item)} className="min-w-0 text-left">
                  <strong className="block truncate text-sm font-extrabold">{item.name}</strong>
                  <span className="mt-1 block text-xs text-muted">
                    {item.owned ? 'Koleksimu' : 'Ditemukan ' + item.uploader}
                    {item.visibility === 'private' ? ' · Privat' : ''}
                  </span>
                </button>
                <a
                  href={externalLocation(item)}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex shrink-0 items-center gap-1 rounded-lg px-2 py-2 text-xs font-bold text-[#7a8d67]"
                  aria-label={'Buka lokasi ' + item.name + ' di OpenStreetMap'}
                >
                  Lokasi
                  <ExternalLink size={13} />
                </a>
              </article>
            ))}
          </div>
        </section>
      )}
      {items.length < total && (
        <Button
          className="mt-4"
          variant="secondary"
          disabled={!online}
          busy={loading}
          onClick={() => load(true)}
        >
          Muat jejak berikutnya
        </Button>
      )}
      <p className="mt-3 text-[10px] leading-5 text-[#b0b19f]">
        Titik foto adalah lokasi pertemuan, bukan pelacakan kucing secara langsung.
      </p>
    </>
  );
}
