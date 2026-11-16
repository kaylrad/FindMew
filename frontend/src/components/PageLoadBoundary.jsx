import React from 'react';
import { Button } from './ui';

export default class PageLoadBoundary extends React.Component {
  state = { failed: false };
  static getDerivedStateFromError() {
    return { failed: true };
  }
  render() {
    if (!this.state.failed) return this.props.children;
    return (
      <section role="alert" className="card mx-auto max-w-lg px-6 py-10 text-center">
        <h1 className="text-xl font-extrabold">Halaman belum bisa dibuka</h1>
        <p className="mt-3 text-sm leading-6 text-muted">
          Periksa koneksi lalu muat ulang aplikasi untuk membuka versi terbaru.
        </p>
        <Button className="mx-auto mt-6" onClick={() => window.location.reload()}>
          Muat ulang aplikasi
        </Button>
      </section>
    );
  }
}
