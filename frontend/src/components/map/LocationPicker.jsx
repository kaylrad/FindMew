import React, { useEffect, useRef, useState } from 'react';
import { Map, NavigationControl } from 'maplibre-gl';
import { Check, LoaderCircle, LocateFixed, MapPin } from 'lucide-react';
import { Button, Modal } from '../ui';
import { MAP_STYLE_URL, DEFAULT_VIEW, isGpuFailure, labelZoomControls } from './map-config';

// Same rounding as a GPS location (±100 m), so a public pin never reveals an exact doorstep.
const round = (value) => Number(value.toFixed(3));

/**
 * The pin stays fixed in the middle and the map moves underneath it, which is easier on a
 * phone than dragging a small marker. The pin reuses the explorer map's paw pin styling.
 */
export default function LocationPicker({ initial, onPick, onClose }) {
  const container = useRef(null);
  const mapRef = useRef(null);
  const mounted = useRef(true);
  const centerRef = useRef(
    initial
      ? { latitude: initial.latitude, longitude: initial.longitude }
      : { latitude: DEFAULT_VIEW.center[1], longitude: DEFAULT_VIEW.center[0] }
  );
  const [center, setCenter] = useState(centerRef.current);
  // The pin counts as placed once the user moves the map, taps it, or uses GPS.
  const [placed, setPlaced] = useState(Boolean(initial));
  const [moving, setMoving] = useState(false);
  const [mapState, setMapState] = useState('loading');
  const [attempt, setAttempt] = useState(0);
  const [locating, setLocating] = useState(false);
  const [notice, setNotice] = useState('');

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);

  useEffect(() => {
    const node = container.current;
    let map;
    let disposed = false;
    let loaded = false;
    let resizeObserver;
    setMapState('loading');
    const timeout = setTimeout(() => {
      if (!disposed && !loaded) setMapState('error');
    }, 20000);
    try {
      map = new Map({
        container: node,
        style: MAP_STYLE_URL,
        center: [centerRef.current.longitude, centerRef.current.latitude],
        zoom: initial ? 16 : DEFAULT_VIEW.zoom,
        minZoom: 2,
        maxZoom: 19,
        attributionControl: { compact: true },
        dragRotate: false,
        pitchWithRotate: false,
        fadeDuration: 150,
      });
    } catch {
      clearTimeout(timeout);
      setMapState('unsupported');
      return;
    }
    mapRef.current = map;
    map.touchZoomRotate.disableRotation();
    map.addControl(new NavigationControl({ showCompass: false }), 'top-left');
    map.getCanvas().setAttribute('aria-label', 'Peta untuk memilih lokasi pertemuan');
    labelZoomControls(node);
    const sync = () => {
      const { lat, lng } = map.getCenter();
      centerRef.current = { latitude: lat, longitude: lng };
      setCenter(centerRef.current);
    };
    map.on('load', () => {
      if (disposed) return;
      loaded = true;
      clearTimeout(timeout);
      setMapState('ready');
    });
    map.on('movestart', () => setMoving(true));
    map.on('moveend', (event) => {
      setMoving(false);
      sync();
      if (event.originalEvent) setPlaced(true);
    });
    map.on('click', (event) => {
      setPlaced(true);
      map.easeTo({ center: event.lngLat, duration: 450 });
    });
    map.on('error', (event) => {
      if (disposed) return;
      if (isGpuFailure(event.error)) {
        clearTimeout(timeout);
        setMapState('unsupported');
      } else if (!loaded) setMapState('error');
    });
    if (typeof ResizeObserver === 'function') {
      resizeObserver = new ResizeObserver(() => {
        if (!disposed) map.resize();
      });
      resizeObserver.observe(node);
    }
    return () => {
      disposed = true;
      clearTimeout(timeout);
      resizeObserver?.disconnect();
      map.remove();
      mapRef.current = null;
    };
  }, [attempt]);

  function locate() {
    if (!navigator.geolocation) {
      setNotice('Browser ini belum mendukung lokasi. Geser peta untuk memilih titik.');
      return;
    }
    setLocating(true);
    setNotice('');
    navigator.geolocation.getCurrentPosition(
      (position) => {
        if (!mounted.current) return;
        setLocating(false);
        setPlaced(true);
        const target = { latitude: position.coords.latitude, longitude: position.coords.longitude };
        if (mapRef.current)
          mapRef.current.flyTo({ center: [target.longitude, target.latitude], zoom: 16 });
        else {
          centerRef.current = target;
          setCenter(target);
        }
      },
      () => {
        if (!mounted.current) return;
        setLocating(false);
        setNotice('Lokasi belum diberikan. Geser peta untuk memilih titik pertemuan.');
      },
      { timeout: 12000, maximumAge: 60000, enableHighAccuracy: false }
    );
  }

  // Start from the user's position when they have already allowed it; never prompt on open.
  useEffect(() => {
    if (initial || !navigator.permissions?.query) return;
    navigator.permissions
      .query({ name: 'geolocation' })
      .then((permission) => {
        if (permission.state === 'granted' && mounted.current) locate();
      })
      .catch(() => {});
  }, []);

  const unavailable = mapState === 'unsupported' || mapState === 'error';
  return (
    <Modal title="Pilih lokasi pertemuan" onClose={onClose} wide>
      <p className="-mt-3 mb-4 text-xs leading-6 text-muted">
        Geser atau ketuk peta sampai pin berada di tempat kamu bertemu kucing ini.
      </p>
      <div className="findmew-picker" data-moving={moving} data-map-state={mapState}>
        <div
          ref={container}
          className="findmew-map h-full w-full"
          data-map-provider="openfreemap"
        />
        <span className="findmew-picker-target" aria-hidden="true" />
        <span className="findmew-map-pin findmew-picker-pin" aria-hidden="true">
          <span className="findmew-map-pin-disc">
            <span>🐾</span>
          </span>
        </span>
        <button
          type="button"
          onClick={locate}
          disabled={locating}
          aria-label="Pindahkan pin ke lokasiku"
          title="Lokasiku"
          className="absolute bottom-8 right-3 z-10 rounded-xl border border-line bg-white p-3 text-[#8c9b79] shadow-lg disabled:opacity-60"
        >
          {locating ? (
            <LoaderCircle size={20} className="animate-spin" />
          ) : (
            <LocateFixed size={20} />
          )}
        </button>
        {mapState === 'loading' && (
          <span
            role="status"
            className="absolute left-1/2 top-3 z-10 flex -translate-x-1/2 items-center gap-2 whitespace-nowrap rounded-full bg-white px-4 py-2 text-xs shadow-sm"
          >
            <LoaderCircle size={13} className="animate-spin" />
            Memuat peta...
          </span>
        )}
        {unavailable && (
          <div
            role="alert"
            className="absolute inset-0 z-20 flex flex-col items-center justify-center gap-4 bg-[#e8eddf]/95 px-7 text-center"
          >
            <MapPin size={34} className="text-[#8d9d7c]" />
            <p className="max-w-sm text-sm leading-6 text-[#737f66]">
              {mapState === 'unsupported'
                ? 'Browser belum bisa menggambar peta. Gunakan tombol Lokasiku di form.'
                : 'Peta belum bisa dimuat. Periksa koneksi lalu coba lagi.'}
            </p>
            {mapState === 'error' && (
              <Button type="button" variant="secondary" onClick={() => setAttempt((v) => v + 1)}>
                Muat ulang peta
              </Button>
            )}
          </div>
        )}
      </div>
      <div className="mt-4 flex items-start gap-3 rounded-xl bg-[#f5f5ed] p-3.5">
        <MapPin size={16} className="mt-0.5 shrink-0 text-[#97a382]" />
        <div aria-live="polite">
          <p className="text-xs font-extrabold">
            {moving
              ? 'Menggeser pin...'
              : placed
                ? `${round(center.latitude)}, ${round(center.longitude)}`
                : 'Pin belum dipindahkan'}
          </p>
          <p className="mt-1 text-[10px] leading-5 text-muted">
            {notice || 'Titik disimpan dibulatkan ±100 m untuk menjaga privasi.'}
          </p>
        </div>
      </div>
      <div className="mt-5 grid grid-cols-2 gap-3">
        <Button type="button" variant="secondary" onClick={onClose}>
          Batal
        </Button>
        <Button
          type="button"
          disabled={!placed || moving || unavailable}
          onClick={() =>
            onPick({
              latitude: round(center.latitude),
              longitude: round(center.longitude),
              source: 'map',
            })
          }
        >
          <Check size={16} />
          Pakai lokasi ini
        </Button>
      </div>
    </Modal>
  );
}
