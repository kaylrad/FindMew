import React from 'react';
import { MapPin, RefreshCw } from 'lucide-react';
import { Button } from './ui';

export default class PageLoadBoundary extends React.Component {
  state = { failed: false };
  static getDerivedStateFromError() {
    return { failed: true };
  }
  render() {
    if (!this.state.failed) return this.props.children;
    const isMap = this.props.page === 'map';
    return (
      <section role="alert" className="card mx-auto max-w-lg px-6 py-10 text-center">
        {isMap && <MapPin size={36} className="mx-auto mb-4 text-[#9baa88]" />}
        <h1 className="text-xl font-extrabold">
          {isMap ? 'Peta belum bisa dibuka' : 'Halaman belum bisa dibuka'}
        </h1>
        <p className="mt-3 text-sm leading-6 text-muted">
          {isMap
            ? 'Sambungkan internet lalu muat ulang aplikasi untuk membuka versi peta terbaru.'
            : 'Periksa koneksi lalu muat ulang aplikasi untuk membuka versi terbaru.'}
        </p>
        <Button
          className="mx-auto mt-6"
          variant={isMap ? 'secondary' : 'primary'}
          onClick={() => window.location.reload()}
        >
          {isMap && <RefreshCw size={16} />}
          Muat ulang aplikasi
        </Button>
      </section>
    );
  }
}
