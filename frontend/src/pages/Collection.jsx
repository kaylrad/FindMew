import React, { useState } from 'react';
import { Search, Camera, Lock, Globe, MapPin, Heart, Pencil, Trash2 } from 'lucide-react';
import { useApp } from '../context';
import CollectionFields from '../components/CollectionFields';
import {
  Photo,
  Button,
  Modal,
  Empty,
  CollectionTimes,
  fullTimestamp,
  shortTimestamp,
} from '../components/ui';

export default function Collection({ openCollection, navigate }) {
  const { collections, total, loadMore, online } = useApp();
  const [query, setQuery] = useState('');
  const [filter, setFilter] = useState('all');
  const [more, setMore] = useState(false);
  const shown = collections.filter(
    (c) =>
      c.name.toLowerCase().includes(query.toLowerCase()) &&
      (filter === 'all' || c.visibility === filter)
  );
  return (
    <>
      <div className="mt-3 flex items-start justify-between gap-4">
        <div>
          <h1 className="page-title">Koleksi Mew</h1>
          <p className="mt-2 text-sm text-muted">{total} koleksi Mew yang kamu punya.</p>
        </div>
        <Button
          onClick={() => navigate('add')}
          disabled={!online}
          className="hidden sm:inline-flex"
        >
          <Camera size={17} />
          Tambah Mew
        </Button>
      </div>
      <div className="my-7 flex flex-wrap items-center justify-between gap-4">
        <div className="flex gap-1.5 rounded-full bg-[#efeee5] p-1">
          {[
            ['all', 'Semua'],
            ['public', 'Publik'],
            ['private', 'Privat'],
          ].map(([id, label]) => (
            <button
              className={`rounded-full px-4 py-2 text-xs font-bold transition ${filter === id ? 'bg-white shadow-sm' : 'text-muted'}`}
              key={id}
              onClick={() => setFilter(id)}
            >
              {label}
            </button>
          ))}
        </div>
        <label className="relative w-full sm:w-60">
          <Search size={16} className="absolute left-3.5 top-3.5 text-[#b1b3a1]" />
          <input
            aria-label="Cari nama Mew"
            placeholder="Cari teman berbulu..."
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            className="input pl-10"
          />
        </label>
      </div>
      {shown.length ? (
        <div className="grid grid-cols-2 gap-3 md:grid-cols-3 md:gap-5">
          {shown.map((item) => (
            <button key={item.id} onClick={() => openCollection(item)} className="photo-card group">
              <div className="relative aspect-[.95] overflow-hidden rounded-xl">
                <Photo item={item} className="transition duration-500 group-hover:scale-105" />
                <span className="absolute right-2.5 top-2.5 rounded-full bg-white/85 p-2 text-[#828975]">
                  {item.visibility === 'private' ? <Lock size={12} /> : <Globe size={12} />}
                </span>
              </div>
              <div className="flex items-center justify-between gap-2 p-3.5">
                <div className="min-w-0">
                  <h2 className="truncate text-sm font-extrabold">{item.name}</h2>
                  <time
                    dateTime={item.created_at}
                    title={fullTimestamp(item.created_at)}
                    className="mt-1 block text-[10px] text-muted"
                  >
                    {shortTimestamp(item.created_at)}
                  </time>
                </div>
                <span className="flex shrink-0 items-center gap-2">
                  {item.like_count > 0 && (
                    <span
                      className="flex items-center gap-0.5 text-[10px] font-bold text-[#c0887b]"
                      aria-label={item.like_count + ' suka'}
                    >
                      <Heart size={12} fill="currentColor" aria-hidden="true" />
                      {item.like_count}
                    </span>
                  )}
                  {item.latitude != null && <MapPin size={15} className="text-[#a5b093]" />}
                </span>
              </div>
            </button>
          ))}
        </div>
      ) : (
        <Empty icon={Camera} title={query ? 'Belum ketemu Mew itu' : 'Album kecilmu menunggu'}>
          {query
            ? 'Coba nama lain atau muat koleksi berikutnya.'
            : 'Mulai dari satu foto. Temui kucing di sekitarmu dan simpan ceritanya.'}
        </Empty>
      )}
      {collections.length < total && (
        <div className="mt-7 text-center">
          <Button
            variant="secondary"
            disabled={!online}
            busy={more}
            onClick={async () => {
              setMore(true);
              await loadMore();
              setMore(false);
            }}
          >
            Muat lebih banyak
          </Button>
        </div>
      )}
    </>
  );
}

export function CollectionDetail({ item, onClose }) {
  const { online, busy, mutate } = useApp();
  const [editing, setEditing] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [form, setForm] = useState({
    name: item.name,
    notes: item.notes,
    visibility: item.visibility,
  });
  const change = (e) => setForm({ ...form, [e.target.name]: e.target.value });
  return (
    <Modal
      title={deleting ? 'Hapus kenangan ini?' : editing ? 'Edit cerita Mew' : item.name}
      onClose={() => {
        if (!busy) onClose();
      }}
    >
      {deleting ? (
        <>
          <p className="text-sm leading-7 text-muted">
            Foto dan cerita <strong>{item.name}</strong> akan dihapus permanen dari koleksimu. Koin
            yang sudah diperoleh tetap tersimpan.
          </p>
          <div className="mt-6 grid grid-cols-2 gap-3">
            <Button variant="secondary" disabled={busy} onClick={() => setDeleting(false)}>
              Batal
            </Button>
            <Button
              variant="danger"
              disabled={!online}
              busy={busy}
              onClick={() =>
                mutate(`/collections/${item.id}`, null, {
                  method: 'DELETE',
                  message: (r) =>
                    r.pending
                      ? 'Koleksi disembunyikan. Pembersihan foto tertunda dan akan dicoba ulang.'
                      : 'Koleksi dan fotonya berhasil dihapus.',
                  onSuccess: onClose,
                })
              }
            >
              Ya, hapus
            </Button>
          </div>
        </>
      ) : editing ? (
        <form
          onSubmit={(e) => {
            e.preventDefault();
            mutate(`/collections/${item.id}`, form, {
              method: 'PATCH',
              message: 'Cerita Mew berhasil diperbarui.',
              onSuccess: onClose,
            });
          }}
        >
          <CollectionFields form={form} change={change} />
          <Button className="mt-6 w-full" busy={busy} disabled={!online}>
            Simpan perubahan
          </Button>
          <button
            type="button"
            onClick={() => setEditing(false)}
            className="mt-3 w-full py-2 text-xs font-bold text-muted"
          >
            Kembali
          </button>
        </form>
      ) : (
        <>
          <div className="aspect-[1.15] overflow-hidden rounded-2xl">
            <Photo item={item} />
          </div>
          <CollectionTimes item={item} className="mt-5" />
          <div className="mt-2 flex flex-wrap gap-3 text-[11px] text-muted">
            <span className="flex items-center gap-1.5">
              {item.visibility === 'private' ? <Lock size={13} /> : <Globe size={13} />}{' '}
              {item.visibility === 'private' ? 'Hanya kamu' : 'Publik'}
            </span>
            {(item.visibility === 'public' || item.like_count > 0) && (
              <span className="flex items-center gap-1.5">
                <Heart
                  size={13}
                  className={item.like_count ? 'text-[#c0887b]' : ''}
                  fill={item.like_count ? 'currentColor' : 'none'}
                />
                {item.like_count
                  ? 'Disukai ' + item.like_count + ' penjelajah'
                  : 'Belum ada yang menyukai'}
              </span>
            )}
          </div>
          <p className="mt-4 flex items-start gap-2 text-xs leading-6 text-muted">
            <MapPin size={15} className="mt-1 shrink-0" />
            {item.latitude != null
              ? `${item.latitude.toFixed(3)}, ${item.longitude.toFixed(3)}${item.visibility === 'private' ? ' · lokasi privat' : ''}`
              : 'Lokasi tidak ditambahkan'}
          </p>
          <div className="mt-6 grid grid-cols-2 gap-3">
            <Button variant="secondary" disabled={!online} onClick={() => setEditing(true)}>
              <Pencil size={15} />
              Edit cerita
            </Button>
            <Button
              variant="ghost"
              className="text-[#bd7d71]"
              disabled={!online}
              onClick={() => setDeleting(true)}
            >
              <Trash2 size={15} />
              Hapus
            </Button>
          </div>
        </>
      )}
    </Modal>
  );
}
