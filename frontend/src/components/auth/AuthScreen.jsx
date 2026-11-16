import React, { useState } from 'react';
import { Leaf, Heart, ArrowRight } from 'lucide-react';
import { useApp } from '../../context';
import { Button } from '../ui';
import { Cat } from '../CatRoom';
export default function AuthScreen() {
  const { config, login, online } = useApp(),
    [register, setRegister] = useState(false),
    [email, setEmail] = useState(''),
    [password, setPassword] = useState(''),
    [name, setName] = useState(''),
    [busy, setBusy] = useState(false),
    [error, setError] = useState('');
  async function submit(e) {
    e.preventDefault();
    setBusy(true);
    setError('');
    try {
      await login(email, password, register ? name : undefined);
    } catch (e) {
      setError(
        e.message === 'Invalid login credentials'
          ? 'Email atau kata sandi belum cocok.'
          : e.message === 'Email not confirmed'
            ? 'Konfirmasikan emailmu terlebih dahulu.'
            : e.message
      );
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="mx-auto grid min-h-[calc(100dvh-130px)] max-w-5xl items-center gap-8 px-5 py-10 md:grid-cols-2 md:gap-20">
      <div className="hidden md:block">
        <div className="relative mx-auto max-w-sm rounded-t-[180px] rounded-b-[60px] bg-[#f0e5ce] pt-16">
          <span className="absolute right-8 top-16 rotate-12 text-[#c5aa78]">
            <Heart size={35} strokeWidth={1.2} />
          </span>
          <Cat className="mx-auto w-[95%]" />
          <div className="absolute bottom-4 left-1/2 -translate-x-1/2 whitespace-nowrap rounded-full bg-[#fff9eb] px-5 py-2 text-xs text-[#a69675]">
            Ada bahagia di setiap meow.
          </div>
        </div>
      </div>
      <div>
        <p className="eyebrow">
          <Leaf size={12} className="mr-1 inline" /> RUMAH UNTUK SETIAP MEOW
        </p>
        <h1 className="mt-4 text-[38px] font-black leading-[1.2] tracking-tight md:text-5xl">
          Temukan.
          <br />
          Abadikan.
          <br />
          <span className="text-[#d29c78]">Sayangi.</span>
        </h1>
        <p className="mt-5 max-w-sm text-sm leading-7 text-muted">
          Kumpulkan pertemuan kecil dengan kucing di sekitarmu. Bawa pulang kenangan dan kebahagiaan
          untuk MyMew.
        </p>
        <form onSubmit={submit} className="mt-7 space-y-4">
          {config.demo ? (
            <div className="rounded-2xl border border-[#e8dfc6] bg-[#f5eedb] p-4 text-xs leading-6 text-[#a3936c]">
              Mode demo lokal. Akun Nadia dan contoh foto tersedia untuk mencoba semua alur. Data
              demo terpisah dari Supabase.
            </div>
          ) : (
            <>
              {register && (
                <label className="label">
                  Nama
                  <input
                    className="input mt-2"
                    required
                    maxLength={60}
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    autoComplete="name"
                  />
                </label>
              )}
              <label className="label">
                Email
                <input
                  className="input mt-2"
                  required
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  autoComplete="email"
                  placeholder="namamu@email.com"
                />
              </label>
              <label className="label">
                Kata sandi
                <input
                  className="input mt-2"
                  required
                  type="password"
                  minLength={6}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  autoComplete={register ? 'new-password' : 'current-password'}
                  placeholder="Minimal 6 karakter"
                />
              </label>
            </>
          )}
          {error && (
            <p role="alert" className="text-xs text-rose-600">
              {error}
            </p>
          )}
          <Button className="w-full" busy={busy} disabled={!online}>
            {config.demo ? 'Jelajahi demo FindMew' : register ? 'Buat akun' : 'Masuk ke rumah Mew'}
            <ArrowRight size={17} />
          </Button>
          {!config.demo && (
            <p className="text-center text-xs text-muted">
              {register ? 'Sudah punya akun?' : 'Baru di FindMew?'}{' '}
              <button
                type="button"
                onClick={() => {
                  setRegister(!register);
                  setError('');
                }}
                className="font-extrabold text-[#c29271]"
              >
                {register ? 'Masuk' : 'Buat akun'}
              </button>
            </p>
          )}
        </form>
      </div>
    </div>
  );
}
