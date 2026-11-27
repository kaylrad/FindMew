import React, { useState } from 'react';
import { Leaf, Heart, ArrowRight } from 'lucide-react';
import { useApp } from '../../context';
import { Button } from '../ui';

export default function AuthScreen() {
  const { config, login, online } = useApp();
  const [register, setRegister] = useState(false);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [name, setName] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
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
          <AuthCat className="mx-auto w-[95%]" />
        </div>
      </div>
      <div>
        <h1 className="mt-4 text-[38px] font-black leading-[1.2] tracking-tight md:text-5xl">
          Selamat.
          <br />
          Datang di
          <br />
          <span className="text-[#d29c78]">FindMew.</span>
        </h1>
        <p className="mt-5 max-w-sm text-sm leading-7 text-muted">
          Silahkan Login untuk kumpulkan koleksi Kucing!
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

function AuthCat({ className = '' }) {
  return (
    <svg
      className={className}
      viewBox="0 0 320 300"
      fill="none"
      role="img"
      aria-label="Kucing digital Mochi"
    >
      <ellipse cx="162" cy="271" rx="102" ry="15" fill="#A87E5C" opacity=".12" />
      <path
        d="M229 238c53 4 63-44 45-51-22-9-15 28-40 17"
        fill="#E9A15F"
        stroke="#C87D44"
        strokeWidth="2.5"
      />
      <path
        d="M99 191c-15 19-22 55-12 69 15 15 45 12 74 12s58 3 69-13c10-18 3-49-13-69"
        fill="#F0B36D"
        stroke="#C98A52"
        strokeWidth="2"
      />
      <ellipse cx="161" cy="237" rx="42" ry="35" fill="#FFE6BC" />
      <path
        d="m91 108-5-68c0-7 6-10 12-6l44 29m37 0 44-29c6-4 12-1 12 6l-5 70"
        fill="#F2B66F"
        stroke="#C98A52"
        strokeWidth="2.5"
      />
      <path d="m96 87-3-42 35 24m65 0 33-24-3 43" fill="#ECA18A" />
      <path
        d="M243 136c0 47-33 76-82 76s-82-29-82-76c0-45 35-77 82-77s82 32 82 77Z"
        fill="#F4BC7B"
        stroke="#C98A52"
        strokeWidth="2.5"
      />
      <path
        d="m139 63 7 21m14-24v24m15-22-3 21"
        stroke="#D99450"
        strokeWidth="9"
        strokeLinecap="round"
      />
      <path
        d="m82 119 19 6m-22 10 17 3m144-19-19 6m21 10-17 3"
        stroke="#D99450"
        strokeWidth="6"
        strokeLinecap="round"
      />
      <ellipse cx="161" cy="166" rx="51" ry="32" fill="#FFE8C6" />
      <g fill="#624631">
        <ellipse cx="123" cy="130" rx="5" ry="7" />
        <ellipse cx="199" cy="130" rx="5" ry="7" />
        <circle cx="125" cy="128" r="1.5" fill="white" />
        <circle cx="201" cy="128" r="1.5" fill="white" />
      </g>
      <ellipse cx="108" cy="149" rx="12" ry="7" fill="#EC9E82" opacity=".65" />
      <ellipse cx="213" cy="149" rx="12" ry="7" fill="#EC9E82" opacity=".65" />
      <path d="M155 151q6-5 12 0l-6 7Z" fill="#BB795E" />
      <path
        d="M161 158v6m0 0q-10 9-16 0m16 0q10 9 16 0"
        stroke="#8D5E46"
        strokeWidth="2.5"
        strokeLinecap="round"
      />
      <path
        d="m104 157-25-3m24 11-22 5m137-13 25-3m-24 11 22 5"
        stroke="#B57B4F"
        strokeWidth="1.7"
        strokeLinecap="round"
      />
      <path
        d="M110 229v31q-16 16-28 0m127-31v31q16 16 28 0"
        fill="#F4BC7B"
        stroke="#C98A52"
        strokeWidth="2"
        strokeLinecap="round"
      />
      <path
        d="M101 259v7m-8-7v8m126-8v7m8-7v8"
        stroke="#C98A52"
        strokeWidth="1.5"
        strokeLinecap="round"
      />
      <path d="M115 205q46 14 91 0" stroke="#CB8068" strokeWidth="8" strokeLinecap="round" />
      <circle cx="161" cy="215" r="10" fill="#E9BA62" stroke="#BA8B3C" strokeWidth="1.5" />
      <path d="M161 210v7m-2-3h4" stroke="#FFF0BE" strokeWidth="2" />
    </svg>
  );
}
