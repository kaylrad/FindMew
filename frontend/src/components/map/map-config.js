import { setWorkerUrl } from 'maplibre-gl';
import workerUrl from 'maplibre-gl/dist/maplibre-gl-worker.mjs?worker&url';
import 'maplibre-gl/dist/maplibre-gl.css';
import './explorer-map.css';

// Shared by the explorer map and the location picker so both look and load the same way.
// Vite emits the worker on our origin; no blob worker or external script is required.
setWorkerUrl(workerUrl);
export const MAP_STYLE_URL = 'https://tiles.openfreemap.org/styles/liberty';
export const DEFAULT_VIEW = { center: [106.819, -6.2], zoom: 13 };

export const isGpuFailure = (error) =>
  error?.name === 'GPUInitializationError' ||
  /WebGL|GPU|graphics context/i.test(error?.message || '');

/** Indonesian labels for the zoom buttons MapLibre adds. */
export function labelZoomControls(node) {
  for (const [selector, label] of [
    ['.maplibregl-ctrl-zoom-in', 'Perbesar peta'],
    ['.maplibregl-ctrl-zoom-out', 'Perkecil peta'],
  ]) {
    const button = node.querySelector(selector);
    if (button) {
      button.title = label;
      button.setAttribute('aria-label', label);
    }
  }
}
