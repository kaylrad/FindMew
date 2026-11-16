import React, { useEffect, useRef } from 'react';
import { Map, Marker, LngLatBounds, NavigationControl, setWorkerUrl } from 'maplibre-gl';
import workerUrl from 'maplibre-gl/dist/maplibre-gl-worker.mjs?worker&url';
import 'maplibre-gl/dist/maplibre-gl.css';
import './explorer-map.css';

// Vite emits the worker on our origin; no blob worker or external script is required.
setWorkerUrl(workerUrl);
export const MAP_STYLE_URL = 'https://tiles.openfreemap.org/styles/liberty';
const initialView = { center: [106.819, -6.2], zoom: 13 };

function publicMarker(item, onSelect) {
  const button = document.createElement('button');
  button.type = 'button';
  button.className = 'findmew-map-pin';
  button.setAttribute('aria-label', 'Buka pertemuan ' + item.name);
  button.dataset.mapCollectionId = item.id;
  button.dataset.mapOwned = String(item.owned === true);
  const disc = document.createElement('span');
  disc.className = 'findmew-map-pin-disc';
  disc.setAttribute('aria-hidden', 'true');
  const paw = document.createElement('span');
  paw.textContent = '🐾';
  disc.append(paw);
  button.append(disc);
  if (item.owned) disc.style.background = '#94a77c';
  button.addEventListener('click', (event) => {
    event.stopPropagation();
    onSelect(item);
  });
  return button;
}

export default function ExplorerMap({
  items,
  focusId = null,
  position,
  attempt = 0,
  onSelect,
  onStatus,
}) {
  const container = useRef(null),
    mapRef = useRef(null),
    markers = useRef([]),
    locationMarker = useRef(null),
    view = useRef(initialView);
  const statusRef = useRef(onStatus),
    selectRef = useRef(onSelect);
  const framed = useRef(false),
    focused = useRef(null);
  statusRef.current = onStatus;
  selectRef.current = onSelect;

  useEffect(() => {
    const node = container.current;
    if (!node) return;
    let map,
      resizeObserver,
      disposed = false,
      loaded = false,
      hadResourceError = false,
      gpuUnavailable = false;
    framed.current = false;
    focused.current = null;
    statusRef.current({ state: 'loading', message: '' });
    const timeout = setTimeout(() => {
      if (!disposed && !loaded)
        statusRef.current({
          state: 'error',
          message: 'Peta belum selesai dimuat. Periksa koneksi internet lalu coba lagi.',
        });
    }, 20000);
    try {
      map = new Map({
        container: node,
        style: MAP_STYLE_URL,
        ...view.current,
        minZoom: 1,
        maxZoom: 19,
        attributionControl: { compact: true },
        dragRotate: false,
        pitchWithRotate: false,
        fadeDuration: 150,
      });
      mapRef.current = map;
      map.scrollZoom.disable();
      map.touchZoomRotate.disableRotation();
      map.addControl(new NavigationControl({ showCompass: false }), 'top-left');
      map.getCanvas().setAttribute('aria-label', 'Peta pertemuan kucing');
      const zoomIn = node.querySelector('.maplibregl-ctrl-zoom-in'),
        zoomOut = node.querySelector('.maplibregl-ctrl-zoom-out');
      if (zoomIn) {
        zoomIn.title = 'Perbesar peta';
        zoomIn.setAttribute('aria-label', 'Perbesar peta');
      }
      if (zoomOut) {
        zoomOut.title = 'Perkecil peta';
        zoomOut.setAttribute('aria-label', 'Perkecil peta');
      }
      map.on('load', () => {
        if (disposed || gpuUnavailable) return;
        loaded = true;
        clearTimeout(timeout);
        statusRef.current({
          state: hadResourceError ? 'error' : 'ready',
          loaded: true,
          message: hadResourceError
            ? 'Sebagian peta belum bisa dimuat. Kamu tetap bisa membuka lokasi dari daftar di bawah.'
            : '',
        });
      });
      map.on('error', (event) => {
        if (gpuUnavailable) return;
        if (
          event.error?.name === 'GPUInitializationError' ||
          /WebGL|GPU|graphics context/i.test(event.error?.message || '')
        ) {
          gpuUnavailable = true;
          clearTimeout(timeout);
          if (!disposed)
            statusRef.current({
              state: 'unsupported',
              loaded,
              message:
                'Browser belum bisa menggambar peta. Kamu tetap bisa membuka lokasi pertemuan dari daftar di bawah.',
            });
          return;
        }
        hadResourceError = true;
        if (!disposed)
          statusRef.current({
            state: 'error',
            loaded,
            message:
              'Penyedia peta belum bisa dijangkau. Titik pertemuan tetap tersedia dalam daftar di bawah.',
          });
      });
      map.on('webglcontextlost', (event) => {
        event.originalEvent?.preventDefault();
        clearTimeout(timeout);
        gpuUnavailable = true;
        if (!disposed)
          statusRef.current({
            state: 'unsupported',
            message:
              'Browser belum bisa menggambar peta. Kamu tetap bisa membuka lokasi pertemuan dari daftar di bawah.',
          });
      });
      map.on('webglcontextrestored', () => {
        gpuUnavailable = false;
        if (!disposed)
          statusRef.current({
            state: hadResourceError ? 'error' : loaded ? 'ready' : 'loading',
            loaded,
            message: hadResourceError
              ? 'Sebagian peta belum bisa dimuat. Coba muat ulang peta.'
              : '',
          });
      });
      if (typeof ResizeObserver === 'function') {
        resizeObserver = new ResizeObserver(() => {
          if (!disposed) map.resize();
        });
        resizeObserver.observe(node);
      }
    } catch {
      clearTimeout(timeout);
      node.replaceChildren();
      statusRef.current({
        state: 'unsupported',
        message:
          'Peta interaktif belum didukung browser ini. Kamu tetap bisa membuka lokasi pertemuan dari daftar di bawah.',
      });
    }
    return () => {
      disposed = true;
      clearTimeout(timeout);
      resizeObserver?.disconnect();
      markers.current.forEach((marker) => marker.remove());
      markers.current = [];
      locationMarker.current?.remove();
      locationMarker.current = null;
      if (map) {
        try {
          view.current = { center: map.getCenter().toArray(), zoom: map.getZoom() };
        } catch {}
        map.remove();
      }
      mapRef.current = null;
    };
  }, [attempt]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    markers.current.forEach((marker) => marker.remove());
    markers.current = items
      .filter((item) => Number.isFinite(item.latitude) && Number.isFinite(item.longitude))
      .map((item) =>
        new Marker({
          element: publicMarker(item, (value) => selectRef.current(value)),
          anchor: 'bottom',
        })
          .setLngLat([item.longitude, item.latitude])
          .addTo(map)
      );
    const located = items.filter(
      (item) => Number.isFinite(item.latitude) && Number.isFinite(item.longitude)
    );
    const focus = located.find((item) => item.id === focusId);
    if (focus && focused.current !== focusId) {
      map.jumpTo({ center: [focus.longitude, focus.latitude], zoom: 15 });
      focused.current = focusId;
      framed.current = true;
    } else if (!framed.current && located.length) {
      if (located.length === 1)
        map.jumpTo({ center: [located[0].longitude, located[0].latitude], zoom: 15 });
      else {
        const bounds = new LngLatBounds();
        for (const item of located) bounds.extend([item.longitude, item.latitude]);
        map.fitBounds(bounds, { padding: 60, maxZoom: 15, duration: 0 });
      }
      framed.current = true;
    }
    return () => {
      markers.current.forEach((marker) => marker.remove());
      markers.current = [];
    };
  }, [items, focusId, attempt]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !position) return;
    const dot = document.createElement('span');
    dot.className = 'findmew-map-location';
    dot.setAttribute('aria-label', 'Lokasi saya');
    locationMarker.current?.remove();
    locationMarker.current = new Marker({ element: dot }).setLngLat(position).addTo(map);
    map.flyTo({ center: position, zoom: 15, duration: 900 });
    return () => {
      locationMarker.current?.remove();
      locationMarker.current = null;
    };
  }, [position, attempt]);

  return (
    <div
      ref={container}
      className="findmew-map h-full w-full"
      role="region"
      aria-label="Peta pertemuan kucing"
      data-map-provider="openfreemap"
    />
  );
}
