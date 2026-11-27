import React, { useEffect, useRef, useState } from 'react';
import { X, LoaderCircle, Coins, AlertCircle, Check, ImageOff, CalendarClock } from 'lucide-react';
import { useApp } from '../context';
import { request } from '../lib/api';
import { readPhoto, writePhoto, deletePhoto, cacheGeneration } from '../lib/cache';

export function Button({ children, variant = 'primary', className = '', busy = false, ...props }) {
  return (
    <button
      className={`btn ${variant === 'secondary' ? 'btn-secondary' : variant === 'danger' ? 'btn-danger' : variant === 'ghost' ? 'btn-ghost' : 'btn-primary'} ${className}`}
      {...props}
      disabled={props.disabled || busy}
    >
      {busy ? <LoaderCircle size={18} className="animate-spin" /> : null}
      {children}
    </button>
  );
}

export function Coin({ value, className = '' }) {
  return (
    <span className={`inline-flex items-center gap-1.5 font-extrabold ${className}`}>
      <span className="coin-icon">
        <Coins size={14} />
      </span>
      {value}
      <span className="text-xs font-medium opacity-65">koin</span>
    </span>
  );
}

export function Modal({ title, children, onClose, wide = false }) {
  const panel = useRef(null);
  useEffect(() => {
    const prev = document.activeElement;
    const overflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    panel.current?.focus();
    const key = (e) => {
      if (e.key === 'Escape') onClose();
      if (e.key === 'Tab') {
        const focusable = panel.current?.querySelectorAll(
          'button:not(:disabled),input,textarea,select,a[href],[tabindex="0"]'
        );
        if (!focusable?.length) return;
        const first = focusable[0];
        const last = focusable[focusable.length - 1];
        if (e.shiftKey && document.activeElement === first) {
          e.preventDefault();
          last.focus();
        } else if (!e.shiftKey && document.activeElement === last) {
          e.preventDefault();
          first.focus();
        }
      }
    };
    document.addEventListener('keydown', key);
    return () => {
      document.body.style.overflow = overflow;
      document.removeEventListener('keydown', key);
      prev?.focus();
    };
  }, []);
  return (
    <div
      className="modal-overlay"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <section
        ref={panel}
        tabIndex={-1}
        role="dialog"
        aria-modal="true"
        aria-label={title}
        className={`modal-panel ${wide ? 'max-w-2xl' : 'max-w-md'}`}
      >
        <div className="mb-6 flex items-center justify-between gap-3">
          <h2 className="text-xl font-extrabold">{title}</h2>
          <button className="icon-button" aria-label="Tutup" onClick={onClose}>
            <X size={20} />
          </button>
        </div>
        {children}
      </section>
    </div>
  );
}

export function Photo({ item, publicPhoto = false, className = '', ...props }) {
  const { session, online } = useApp();
  const [src, setSrc] = useState(null);
  useEffect(() => {
    let cancelled = false;
    let url;
    const generation = cacheGeneration();
    const controller = new AbortController();
    (async () => {
      try {
        let photo;
        if (!publicPhoto && session) {
          photo = await readPhoto(session.user.id, item.id);
          if (photo && !cancelled) {
            url = URL.createObjectURL(photo);
            setSrc(url);
          }
        }
        if (online) {
          const fresh = await request(`/${publicPhoto ? 'map' : 'collections'}/${item.id}/photo`, {
            blob: true,
            publicRequest: publicPhoto,
            signal: controller.signal,
          });
          if (cancelled) return;
          if (url) URL.revokeObjectURL(url);
          url = URL.createObjectURL(fresh);
          setSrc(url);
          if (!publicPhoto && session)
            await writePhoto(session.user.id, item.id, fresh, generation);
        }
      } catch {}
    })();
    return () => {
      cancelled = true;
      controller.abort();
      if (url) URL.revokeObjectURL(url);
    };
  }, [item.id, session?.user.id, online, publicPhoto]);
  return src ? (
    <img
      src={src}
      alt={`Foto kucing ${item.name}`}
      className={`h-full w-full object-cover ${className}`}
      {...props}
    />
  ) : (
    <div
      className={`flex h-full min-h-32 w-full items-center justify-center bg-[#eeebe2] text-[#a2a493] ${className}`}
    >
      <ImageOff size={26} />
      <span className="sr-only">Foto belum tersimpan atau tidak tersedia</span>
    </div>
  );
}

export function Toast() {
  const { toast } = useApp();
  return toast ? (
    <div
      role={toast.type === 'error' ? 'alert' : 'status'}
      className={`toast ${toast.type === 'error' ? 'border-rose-200' : 'border-[#d1dec5]'}`}
    >
      {toast.type === 'error' ? (
        <AlertCircle size={20} className="shrink-0 text-rose-600" />
      ) : (
        <Check size={20} className="shrink-0 text-[#6c885a]" />
      )}
      {toast.message}
    </div>
  ) : null;
}
/** "27 Nov 2026, 14.35" for cards. */
export const shortTimestamp = (d) =>
  new Date(d).toLocaleString('id-ID', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
/** "Jumat, 27 November 2026 pukul 14.35 WIB" for details. */
export const fullTimestamp = (d) =>
  new Date(d).toLocaleString('id-ID', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    timeZoneName: 'short',
  });
const relativeUnits = [
  ['year', 31536000],
  ['month', 2592000],
  ['week', 604800],
  ['day', 86400],
  ['hour', 3600],
  ['minute', 60],
];
/** "baru saja", "5 menit yang lalu", "kemarin" ... */
export function relativeTime(d, now = Date.now()) {
  const seconds = Math.round((new Date(d).getTime() - now) / 1000);
  if (Math.abs(seconds) < 60) return 'baru saja';
  const format = new Intl.RelativeTimeFormat('id', { numeric: 'auto' });
  for (const [unit, size] of relativeUnits)
    if (Math.abs(seconds) >= size) return format.format(Math.trunc(seconds / size), unit);
  return 'baru saja';
}
/** Creation time of a collection, with when it was last edited if that differs. */
export function CollectionTimes({ item, className = '' }) {
  const edited =
    item.updated_at &&
    new Date(item.updated_at).getTime() - new Date(item.created_at).getTime() > 60000;
  return (
    <div className={`space-y-1 text-[11px] leading-5 text-muted ${className}`}>
      <p className="flex items-start gap-1.5">
        <CalendarClock size={13} className="mt-[3px] shrink-0" aria-hidden="true" />
        <span>
          Ditemukan{' '}
          <time dateTime={item.created_at} className="font-bold text-[#7c8270]">
            {fullTimestamp(item.created_at)}
          </time>{' '}
          · {relativeTime(item.created_at)}
        </span>
      </p>
      {edited && (
        <p className="pl-[19px]">
          Diperbarui <time dateTime={item.updated_at}>{shortTimestamp(item.updated_at)}</time>
        </p>
      )}
    </div>
  );
}

/** Uploaded profile photo, falling back to the emoji avatar. */
export function ProfileAvatar({ profile, className = '' }) {
  const { session, online } = useApp();
  const [src, setSrc] = useState(null);
  const version = profile.photo_updated_at;
  const uid = session?.user.id;
  useEffect(() => {
    if (!version) {
      setSrc(null);
      if (uid) deletePhoto(uid, 'profile');
      return;
    }
    let cancelled = false;
    let url;
    const generation = cacheGeneration();
    const controller = new AbortController();
    const show = (blob) => {
      if (url) URL.revokeObjectURL(url);
      url = URL.createObjectURL(blob);
      setSrc(url);
    };
    (async () => {
      try {
        const cached = uid ? await readPhoto(uid, 'profile') : null;
        if (cached && !cancelled) show(cached);
        if (!online) return;
        const fresh = await request('/profile/photo', { blob: true, signal: controller.signal });
        if (cancelled) return;
        show(fresh);
        if (uid) await writePhoto(uid, 'profile', fresh, generation);
      } catch {}
    })();
    return () => {
      cancelled = true;
      controller.abort();
      if (url) URL.revokeObjectURL(url);
    };
  }, [version, uid, online]);
  return src ? (
    <img
      src={src}
      alt={`Foto profil ${profile.name}`}
      className={`h-full w-full object-cover ${className}`}
    />
  ) : (
    <span role="img" aria-label={`Avatar ${profile.name}`} className={className}>
      {profile.avatar}
    </span>
  );
}

export function Empty({ icon: Icon, title, children }) {
  return (
    <div className="py-16 text-center">
      <span className="mx-auto mb-5 grid h-20 w-20 place-items-center rounded-full bg-[#f1e7d7] text-[#c18c65]">
        <Icon size={32} />
      </span>
      <h2 className="text-xl font-extrabold">{title}</h2>
      <p className="mx-auto mt-2 max-w-sm text-sm leading-7 text-muted">{children}</p>
    </div>
  );
}
