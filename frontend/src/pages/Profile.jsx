import React, { useState } from 'react';
import {
  Pencil,
  Camera,
  Coins,
  Heart,
  LogOut,
  Download,
  ChevronRight,
  ShieldCheck,
  Wifi,
  WifiOff,
} from 'lucide-react';
import { useApp } from '../context';
import { Button, Modal } from '../components/ui';

export default function Profile({ openInstall }) {
  const { data, online, busy, mutate, logout, config } = useApp();
  const [editing, setEditing] = useState(false);
  const [confirmLogout, setConfirmLogout] = useState(false);
  const [form, setForm] = useState(data.profile);
  return (
    <>
      <p className="eyebrow">DI BALIK SETIAP CERITA MEW</p>
      <h1 className="page-title mt-3">Ruang kecilmu</h1>
      <section className="card mt-7 p-6 text-center md:p-10">
        <div
          className="mx-auto grid h-24 w-24 place-items-center rounded-full border-4 border-white bg-[#f0e6d1] text-5xl shadow-sm"
          aria-label="Avatar"
        >
          {data.profile.avatar}
        </div>
        <h2 className="mt-4 text-2xl font-extrabold">{data.profile.name}</h2>
        <p className="mt-1 text-xs text-muted">@{data.profile.username}</p>
        <p className="mx-auto mt-4 max-w-md whitespace-pre-wrap text-sm leading-7 text-muted">
          {data.profile.bio || 'Satu hari, satu pertemuan kecil.'}
        </p>
        <Button
          variant="secondary"
          className="mt-5"
          disabled={!online}
          onClick={() => {
            setForm(data.profile);
            setEditing(true);
          }}
        >
          <Pencil size={14} />
          Edit profil
        </Button>
        <div className="mx-auto mt-8 grid max-w-lg grid-cols-3 divide-x divide-[#eae8dc] border-t border-line pt-6">
          {[
            [Camera, data.collectionCount, 'Koleksi'],
            [Coins, data.profile.coins, 'Koin'],
            [Heart, 1, 'MyMew'],
          ].map(([Icon, num, label]) => (
            <div key={label}>
              <Icon size={18} className="mx-auto mb-2 text-[#b4a582]" />
              <strong className="text-xl font-extrabold">{num}</strong>
              <p className="mt-1 text-[10px] text-muted">{label}</p>
            </div>
          ))}
        </div>
      </section>
      <div className="card mt-5 divide-y divide-[#eeede4] px-5">
        <button onClick={openInstall} className="flex w-full items-center gap-3 py-5 text-left">
          <Download size={19} className="text-[#9da587]" />
          <span className="flex-1">
            <strong className="text-sm">Bawa FindMew ke layar utama</strong>
            <span className="mt-1 block text-[11px] text-muted">
              Pasang aplikasi, lebih dekat dengan MyMew.
            </span>
          </span>
          <ChevronRight size={16} className="text-muted" />
        </button>
        <div className="flex items-center gap-3 py-5">
          {online ? (
            <Wifi size={19} className="text-[#9da587]" />
          ) : (
            <WifiOff size={19} className="text-[#bfa76e]" />
          )}
          <div className="flex-1">
            <strong className="text-sm">{online ? 'Terhubung' : 'Sedang offline'}</strong>
            <p className="mt-1 text-[11px] text-muted">
              {config.demo
                ? 'Mode demo · data tersimpan di server lokal.'
                : 'Data tersimpan pada Supabase milik proyek ini.'}
            </p>
          </div>
        </div>
        <button
          onClick={() => setConfirmLogout(true)}
          className="flex w-full items-center gap-3 py-5 text-sm font-bold text-[#bc8b7d]"
        >
          <LogOut size={18} />
          Keluar akun
          <ChevronRight size={16} className="ml-auto" />
        </button>
      </div>
      <p className="mt-6 flex items-center justify-center gap-2 text-[10px] text-muted">
        <ShieldCheck size={13} />
        Data privat lokal dibersihkan saat keluar akun.
      </p>
      {editing && (
        <Modal title="Sedikit tentang kamu" onClose={() => setEditing(false)}>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              const { name, username, bio, avatar } = form;
              mutate(
                '/profile',
                { name, username, bio, avatar },
                {
                  method: 'PATCH',
                  message: 'Profilmu berhasil diperbarui.',
                  onSuccess: () => setEditing(false),
                }
              );
            }}
          >
            <fieldset>
              <legend className="label mb-3">Pilih avatar</legend>
              <div className="mb-5 flex flex-wrap gap-2">
                {['🐱', '🐈', '🌼', '🌿', '🍑', '🐾'].map((a) => (
                  <button
                    key={a}
                    type="button"
                    aria-label={`Avatar ${a}`}
                    aria-pressed={form.avatar === a}
                    onClick={() => setForm({ ...form, avatar: a })}
                    className={`grid h-11 w-11 place-items-center rounded-full border text-2xl ${form.avatar === a ? 'border-[#acb895] bg-[#eff2e4]' : 'border-line'}`}
                  >
                    {a}
                  </button>
                ))}
              </div>
            </fieldset>
            <div className="space-y-4">
              <label className="label">
                Nama
                <input
                  value={form.name}
                  required
                  maxLength={60}
                  onChange={(e) => setForm({ ...form, name: e.target.value })}
                  className="input mt-2"
                />
              </label>
              <label className="label">
                Username
                <input
                  value={form.username}
                  required
                  minLength={3}
                  maxLength={24}
                  pattern="[a-z0-9_]{3,24}"
                  onChange={(e) => setForm({ ...form, username: e.target.value })}
                  className="input mt-2"
                />
                <span className="mt-1 block text-[10px] font-normal text-muted">
                  3–24 huruf kecil, angka, atau garis bawah.
                </span>
              </label>
              <label className="label">
                Bio
                <textarea
                  value={form.bio}
                  maxLength={280}
                  onChange={(e) => setForm({ ...form, bio: e.target.value })}
                  className="input mt-2 min-h-24"
                />
              </label>
            </div>
            <Button className="mt-6 w-full" busy={busy} disabled={!online}>
              Simpan profil
            </Button>
          </form>
        </Modal>
      )}
      {confirmLogout && (
        <Modal title="Sampai ketemu lagi?" onClose={() => setConfirmLogout(false)}>
          <p className="text-sm leading-7 text-muted">
            Data privat yang tersimpan di perangkat akan dibersihkan. MyMew dan koleksimu tetap
            tersimpan {config.demo ? 'di server demo' : 'di akunmu'}.
          </p>
          <div className="mt-6 grid grid-cols-2 gap-3">
            <Button variant="secondary" onClick={() => setConfirmLogout(false)}>
              Tetap di sini
            </Button>
            <Button onClick={logout}>Keluar</Button>
          </div>
        </Modal>
      )}
    </>
  );
}
