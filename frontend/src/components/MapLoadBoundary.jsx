import React from 'react';
import { MapPin, RefreshCw } from 'lucide-react';
import { Button } from './ui';

// Keep navigation available if an older PWA or an interrupted request cannot load the map module.
export default class MapLoadBoundary extends React.Component {
  state = { failed: false };
  static getDerivedStateFromError() {
    return { failed: true };
  }
  render() {
    if (!this.state.failed) return this.props.children;
    return (
      <section
        role="alert"
        className="mx-auto max-w-lg rounded-2xl border border-line bg-[#fffdf7] px-6 py-10 text-center"
      >
        <MapPin size={36} className="mx-auto mb-4 text-[#9baa88]" />
        <h1 className="text-xl font-extrabold">Peta belum bisa dibuka</h1>
        <p className="mt-3 text-sm leading-6 text-muted">
          Sambungkan internet lalu muat ulang aplikasi untuk membuka versi peta terbaru.
        </p>
        <Button
          className="mx-auto mt-6"
          variant="secondary"
          onClick={() => window.location.reload()}
        >
          <RefreshCw size={16} />
          Muat ulang aplikasi
        </Button>
      </section>
    );
  }
}
