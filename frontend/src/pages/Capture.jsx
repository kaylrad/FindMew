import React, { useEffect, useRef, useState } from 'react';
import {
  Camera,
  RotateCcw,
  MapPin,
  Check,
  Coins,
  ArrowRight,
  ShieldCheck,
  ImagePlus,
  VideoOff,
  LoaderCircle,
  X,
} from 'lucide-react';
import { useApp } from '../context';
import { Button } from '../components/ui';
import CollectionFields from '../components/CollectionFields';

async function compressImage(file) {
  const url = URL.createObjectURL(file);
  try {
    const img = new Image();
    img.src = url;
    await img.decode();
    const scale = Math.min(1, 1600 / Math.max(img.naturalWidth, img.naturalHeight));
    const canvas = document.createElement('canvas');
    canvas.width = Math.max(1, Math.round(img.naturalWidth * scale));
    canvas.height = Math.max(1, Math.round(img.naturalHeight * scale));
    canvas.getContext('2d').drawImage(img, 0, 0, canvas.width, canvas.height);
    return await new Promise((resolve, reject) =>
      canvas.toBlob(
        (b) =>
          b && b.size <= 4 * 1024 * 1024
            ? resolve(b)
            : reject(Error('Foto hasil kompresi masih terlalu besar. Pilih foto lain.')),
        'image/jpeg',
        0.82
      )
    );
  } finally {
    URL.revokeObjectURL(url);
  }
}

export default function Capture({ navigate }) {
  const { config, online, busy, mutate, notify } = useApp();
  const [photo, setPhoto] = useState(null);
  const [preview, setPreview] = useState(null);
  const [streaming, setStreaming] = useState(false);
  const [starting, setStarting] = useState(false);
  const [cameraError, setCameraError] = useState('');
  const [form, setForm] = useState({ name: '', notes: '', visibility: 'private', fed: '' });
  const [location, setLocation] = useState(null);
  const [locating, setLocating] = useState(false);
  const [success, setSuccess] = useState(null);
  const [processing, setProcessing] = useState(false);
  const video = useRef(null);
  const stream = useRef(null);
  const mounted = useRef(true);
  const attempt = useRef(crypto.randomUUID());
  const submitLock = useRef(false);
  const fileRef = useRef(null);
  function stop() {
    stream.current?.getTracks().forEach((t) => t.stop());
    stream.current = null;
    setStreaming(false);
  }
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
      stream.current?.getTracks().forEach((t) => t.stop());
    };
  }, []);
  useEffect(() => {
    if (!photo) {
      setPreview(null);
      return;
    }
    const url = URL.createObjectURL(photo);
    setPreview(url);
    return () => URL.revokeObjectURL(url);
  }, [photo]);
  useEffect(() => {
    if (streaming && video.current) {
      video.current.srcObject = stream.current;
      video.current.play().catch(() => setCameraError('Tekan kamera untuk mencoba kembali.'));
    }
  }, [streaming]);
  async function openCamera() {
    if (!navigator.mediaDevices?.getUserMedia) {
      setCameraError(
        'Kamera langsung tidak tersedia di browser ini. Gunakan tombol kamera perangkat di bawah.'
      );
      return;
    }
    setStarting(true);
    setCameraError('');
    try {
      const s = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: { ideal: 'environment' }, width: { ideal: 1920 } },
        audio: false,
      });
      if (!mounted.current) {
        s.getTracks().forEach((t) => t.stop());
        return;
      }
      stream.current = s;
      setStreaming(true);
    } catch (e) {
      if (mounted.current)
        setCameraError(
          e.name === 'NotAllowedError'
            ? 'Izin kamera belum diberikan. Aktifkan izin di pengaturan browser atau gunakan kamera perangkat.'
            : 'Kamera belum tersedia. Coba kamera perangkat di bawah.'
        );
    } finally {
      if (mounted.current) setStarting(false);
    }
  }
  async function take() {
    if (!video.current?.videoWidth) return;
    setProcessing(true);
    try {
      const canvas = document.createElement('canvas');
      canvas.width = video.current.videoWidth;
      canvas.height = video.current.videoHeight;
      canvas.getContext('2d').drawImage(video.current, 0, 0);
      const blob = await new Promise((resolve) => canvas.toBlob(resolve, 'image/jpeg', 0.9));
      if (!blob) throw Error('Foto tidak dapat diambil.');
      const compressed = await compressImage(blob);
      if (mounted.current) {
        setPhoto(compressed);
        stop();
      }
    } catch (e) {
      notify(e.message, 'error');
    } finally {
      if (mounted.current) setProcessing(false);
    }
  }
  async function selectFile(e) {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 25 * 1024 * 1024) {
      notify('Foto terlalu besar. Maksimal foto sumber 25 MB.', 'error');
      return;
    }
    setProcessing(true);
    try {
      const blob = await compressImage(file);
      if (mounted.current) {
        setPhoto(blob);
        stop();
      }
    } catch {
      notify('Foto tidak dapat dibaca. Pilih JPEG, PNG, atau WebP.', 'error');
    } finally {
      if (mounted.current) setProcessing(false);
      e.target.value = '';
    }
  }
  function addLocation() {
    if (!navigator.geolocation) {
      notify('Browser ini belum mendukung lokasi. Kamu tetap bisa menyimpan foto.', 'error');
      return;
    }
    setLocating(true);
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        if (mounted.current) {
          setLocation({
            latitude: Number(pos.coords.latitude.toFixed(3)),
            longitude: Number(pos.coords.longitude.toFixed(3)),
          });
          setLocating(false);
        }
      },
      () => {
        if (mounted.current) {
          setLocating(false);
          notify('Lokasi belum diberikan. Foto tetap bisa disimpan tanpa lokasi.', 'error');
        }
      },
      { timeout: 12000, maximumAge: 60000, enableHighAccuracy: false }
    );
  }
  async function submit(e) {
    e.preventDefault();
    if (submitLock.current || !photo || !online || !['true', 'false'].includes(form.fed)) return;
    submitLock.current = true;
    const body = new FormData();
    body.append('photo', photo, 'mew.jpg');
    for (const [key, value] of Object.entries({
      ...form,
      latitude: location?.latitude ?? '',
      longitude: location?.longitude ?? '',
    }))
      body.append(key, value);
    try {
      const result = await mutate('/collections', body, {
        action: `capture-${attempt.current}`,
        onSuccess: (r) => {
          stop();
          setSuccess(r);
        },
      });
      if (result) attempt.current = crypto.randomUUID();
    } finally {
      submitLock.current = false;
    }
  }
  if (success)
    return (
      <div className="mx-auto max-w-lg py-12 text-center">
        <div className="mx-auto mb-6 grid h-24 w-24 place-items-center rounded-full bg-[#e9efde] text-[#8d9f77]">
          <Check size={42} />
        </div>
        <p className="eyebrow">SATU PERTEMUAN, SATU CERITA BARU</p>
        <h1 className="mt-4 text-3xl font-black">Halo, {success.name}!</h1>
        <p className="mt-3 text-sm leading-7 text-muted">
          Foto dan ceritamu berhasil tersimpan{config.demo ? ' di penyimpanan demo lokal' : ''}.
          Terima kasih sudah mengabadikan teman kecil ini.
        </p>
        <div className="mx-auto my-7 inline-flex items-center gap-2 rounded-full bg-[#f6edd6] px-6 py-3 font-extrabold text-[#b69348]">
          <Coins size={20} />+{success.reward || 0} koin
        </div>
        {Number.isFinite(success.base_reward) && Number.isFinite(success.feeding_bonus) && (
          <dl
            aria-label="Rincian koin yang diterima"
            className="mx-auto mb-7 max-w-xs space-y-2 rounded-2xl border border-[#e8dfc9] bg-[#fffcf4] p-4 text-xs"
          >
            <div className="flex justify-between gap-4">
              <dt>Foto koleksi</dt>
              <dd className="font-extrabold">+{success.base_reward} koin</dd>
            </div>
            <div className="flex justify-between gap-4">
              <dt>Bonus memberi makan</dt>
              <dd className="font-extrabold">+{success.feeding_bonus} koin</dd>
            </div>
            <div className="flex justify-between gap-4 border-t border-[#e8dfc9] pt-2">
              <dt className="font-extrabold">Total diterima</dt>
              <dd className="font-extrabold">{success.reward || 0} koin</dd>
            </div>
          </dl>
        )}
        {success.replayed && (
          <p className="mb-6 text-xs leading-5 text-muted">
            Pertemuan ini sudah tersimpan. Hadiah tidak diberikan ulang.
          </p>
        )}
        <div className="space-y-3">
          {success.latitude != null && success.longitude != null ? (
            <>
              <p className="mb-4 text-xs leading-6 text-muted">
                {success.visibility === 'private'
                  ? 'Pin foto ini ada di map kamu dan hanya terlihat olehmu.'
                  : 'Pin foto ini sudah ditambahkan ke map publik.'}
              </p>
              <Button
                className="w-full"
                onClick={() => navigate('map', { collectionId: success.id })}
              >
                <MapPin size={16} />
                Lihat pin di map
              </Button>
            </>
          ) : (
            <p className="mb-4 text-xs leading-6 text-muted">
              Foto tersimpan tanpa lokasi, jadi belum memiliki pin di map. Tambahkan lokasi pada
              pertemuan berikutnya untuk menampilkan pin.
            </p>
          )}
          <Button className="w-full" onClick={() => navigate('collection')}>
            Lihat koleksi <ArrowRight size={16} />
          </Button>
          <Button
            className="w-full"
            variant="secondary"
            onClick={() => {
              setPhoto(null);
              setSuccess(null);
              setForm({ name: '', notes: '', visibility: 'private', fed: '' });
              setLocation(null);
            }}
          >
            Temukan Mew lainnya
          </Button>
        </div>
      </div>
    );
  return (
    <>
      <p className="eyebrow">TEMUKAN. ABADIKAN. SAYANGI.</p>
      <h1 className="page-title mt-3">Teman baru hari ini?</h1>
      <p className="mt-2 text-sm leading-6 text-muted">
        Foto koleksi mendapat {config.reward} koin. Jika kucing diberi makan, totalnya{' '}
        {Number(config.reward) + Number(config.feedingBonusReward || 0)} koin.
      </p>
      <div className="mt-7 grid items-start gap-6 md:grid-cols-2">
        <section className="card p-3">
          <div className="relative flex aspect-[.94] items-center justify-center overflow-hidden rounded-2xl bg-[#eee9dd]">
            {preview ? (
              <img src={preview} alt="Preview foto kucing" className="h-full w-full object-cover" />
            ) : streaming ? (
              <video
                ref={video}
                autoPlay
                playsInline
                muted
                className="h-full w-full object-cover"
              />
            ) : (
              <div className="px-8 text-center">
                <div className="mx-auto mb-5 grid h-20 w-20 place-items-center rounded-[26px] border border-[#dfd6c2] bg-[#f7f1e5] text-[#b69d76]">
                  <Camera size={34} strokeWidth={1.3} />
                </div>
                <h2 className="text-xl font-extrabold">Ada Mew di dekatmu?</h2>
                <p className="mt-3 text-xs leading-6 text-muted">
                  Dekati dengan tenang, beri ruang,
                  <br />
                  dan abadikan tanpa mengganggu.
                </p>
                <Button className="mt-6" onClick={openCamera} busy={starting} disabled={!online}>
                  <Camera size={17} />
                  Buka kamera
                </Button>
              </div>
            )}
            {streaming && (
              <div className="absolute bottom-5 inset-x-0 flex justify-center">
                <button
                  aria-label="Ambil foto"
                  onClick={take}
                  disabled={processing}
                  className="grid h-16 w-16 place-items-center rounded-full border-[5px] border-white bg-[#d99b77] shadow-lg"
                >
                  <Camera className="text-white" size={25} />
                </button>
              </div>
            )}
            {processing && (
              <div className="absolute inset-0 grid place-items-center bg-black/20 text-white">
                <LoaderCircle size={32} className="animate-spin" />
              </div>
            )}
          </div>
          {photo ? (
            <Button
              variant="ghost"
              className="mt-2 w-full"
              disabled={busy}
              onClick={() => {
                setPhoto(null);
                attempt.current = crypto.randomUUID();
                openCamera();
              }}
            >
              <RotateCcw size={15} />
              Foto ulang
            </Button>
          ) : (
            <>
              <input
                ref={fileRef}
                type="file"
                accept="image/jpeg,image/png,image/webp"
                capture="environment"
                className="sr-only"
                aria-label="Foto dari kamera perangkat"
                onChange={selectFile}
              />
              <Button
                className="mt-2 w-full"
                variant="ghost"
                disabled={!online || processing}
                onClick={() => fileRef.current.click()}
              >
                <ImagePlus size={15} />
                Gunakan kamera perangkat
              </Button>
            </>
          )}
          {cameraError && (
            <p role="alert" className="m-3 flex gap-2 text-xs leading-6 text-[#b78265]">
              <VideoOff size={16} className="mt-1 shrink-0" />
              {cameraError}
            </p>
          )}
          {config.demo && !photo && (
            <button
              className="mb-2 w-full text-[10px] text-muted underline underline-offset-4"
              onClick={async () => {
                const blob = await fetch('/photos/1.jpg').then((r) => r.blob());
                setPhoto(blob);
                stop();
              }}
              disabled={!online}
            >
              Mode demo: pakai contoh foto
            </button>
          )}
        </section>
        <form className="card p-5 md:p-6" onSubmit={submit}>
          <h2 className="mb-5 text-lg font-extrabold">Kenalan dulu, yuk.</h2>
          <fieldset disabled={busy}>
            <CollectionFields
              form={form}
              change={(e) => setForm({ ...form, [e.target.name]: e.target.value })}
            />
          </fieldset>
          <fieldset
            className="mt-6 rounded-2xl border border-line bg-[#fbf8ef] p-4"
            disabled={busy}
          >
            <legend className="px-1 text-sm font-extrabold text-[#59614e]">
              Apakah kucing ini dikasih makan?
            </legend>
            <div className="mt-1 grid gap-2 sm:grid-cols-2">
              {[
                ['true', 'Ya, sudah diberi makan'],
                ['false', 'Belum'],
              ].map(([value, label]) => (
                <label
                  key={value}
                  className={
                    'flex min-h-12 cursor-pointer items-center gap-2.5 rounded-xl border p-3 ' +
                    (form.fed === value
                      ? 'border-[#99aa83] bg-[#edf2e3]'
                      : 'border-[#e6e2d6] bg-[#fffdf7]')
                  }
                >
                  <input
                    type="radio"
                    name="fed"
                    value={value}
                    checked={form.fed === value}
                    onChange={(event) => setForm({ ...form, fed: event.target.value })}
                    required
                    className="accent-[#869573]"
                  />
                  <span className="text-xs font-bold">{label}</span>
                </label>
              ))}
            </div>
            <p className="mt-3 text-[11px] leading-5 text-muted">
              {Number(config.feedingBonusReward) > 0
                ? 'Jawaban “Ya” mendapat tambahan ' +
                  config.feedingBonusReward +
                  ' koin, jadi total ' +
                  (Number(config.reward) + Number(config.feedingBonusReward)) +
                  ' koin setelah foto tersimpan.'
                : 'Jawab sesuai pertemuanmu dengan kucing ini.'}
            </p>
          </fieldset>
          <div className="mt-5 rounded-xl bg-[#f5f5ed] p-3.5">
            <div className="flex items-center justify-between gap-2">
              <span className="flex items-center gap-2 text-xs font-extrabold">
                <MapPin size={15} className="text-[#97a382]" />
                {location ? 'Lokasi pin ditambahkan' : 'Lokasi pin di map'}
              </span>
              {location ? (
                <button type="button" aria-label="Hapus lokasi" onClick={() => setLocation(null)}>
                  <X size={15} />
                </button>
              ) : (
                <button
                  type="button"
                  onClick={addLocation}
                  disabled={locating || !online || busy}
                  className="text-xs font-bold text-[#8c9875]"
                >
                  {locating ? 'Mencari...' : 'Gunakan lokasiku'}
                </button>
              )}
            </div>
            <p className="mt-2 text-[10px] leading-5 text-muted">
              {location
                ? `${location.latitude}, ${location.longitude} · dibulatkan ±100 m. `
                : 'Tanpa lokasi, foto tersimpan di koleksi dan belum memiliki pin di map. '}
              {form.visibility === 'public'
                ? 'Jika publik, lokasi dan foto terlihat oleh pengguna map.'
                : 'Pin koleksi privat hanya terlihat olehmu.'}
            </p>
          </div>
          <Button
            className="mt-6 w-full"
            busy={busy}
            disabled={!photo || !online || processing || locating || !form.fed}
          >
            <Camera size={17} />
            {busy ? 'Mengunggah & menyimpan...' : 'Simpan pertemuan'}
          </Button>
          <p className="mt-3 flex items-center justify-center gap-1.5 text-[10px] text-muted">
            <ShieldCheck size={12} />
            Hadiah diberikan setelah foto berhasil tersimpan.
          </p>
        </form>
      </div>
    </>
  );
}
