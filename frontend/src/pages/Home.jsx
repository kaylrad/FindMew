import React, { Suspense, lazy, useEffect, useRef, useState } from 'react';
import { ArrowRight, Droplet, Heart, ShoppingBag, Zap } from 'lucide-react';
import { useApp } from '../context';
import { MewHomeRoom } from '../components/mymew/MewScene';

const MewCustomization = lazy(() => import('../components/mymew/MewCustomization'));
import { mewUiAssets } from '../lib/mymew-catalog';
import { Modal, Button } from '../components/ui';
import { GREETING_INTERVAL_MS, POSE_DURATION_MS, resolvePetPose, canGreet } from '../lib/cat-poses';
import '../components/mymew/mymew-home.css';

function StatusBar({ label, value, color, icon }) {
  return (
    <div className="flex w-[150px] items-center gap-[10px]">
      <span
        className={`grid size-[33px] shrink-0 place-items-center rounded-[9px] ${label === 'Energy' ? 'bg-[#f8edd9]' : 'bg-[#f7eae4]'}`}
      >
        <img src={icon} alt="" width="20" height="20" />
      </span>
      <div className="min-w-0 flex-1">
        <div className="flex items-center justify-between text-[12px] leading-[18px] text-[#777e6d]">
          <span>{label}</span>
          <span className="whitespace-nowrap">
            <strong className="font-bold">{value}</strong>
            <span className="ml-[2px] text-[8px] text-[#b2b4a5]">/100</span>
          </span>
        </div>
        <div
          role="progressbar"
          aria-label={label}
          aria-valuenow={value}
          aria-valuemin={0}
          aria-valuemax={100}
          className="mt-2 h-[6px] overflow-hidden rounded-full bg-[#f0eee5]"
        >
          <div
            className="h-full rounded-full transition-[width] duration-500"
            style={{ width: `${value}%`, backgroundColor: color }}
          />
        </div>
      </div>
    </div>
  );
}

function SceneAction({ label, icon, background, onClick, iconWidth = 32, iconHeight = 37 }) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      onClick={onClick}
      className="mew-scene-action relative shrink-0 rounded-full transition-transform hover:-translate-y-0.5 focus-visible:outline-offset-4"
    >
      <img
        src={background}
        alt=""
        className="pointer-events-none absolute left-[-4px] top-[-2px] w-[65px] max-w-none"
      />
      <img
        src={icon}
        alt=""
        className="pointer-events-none absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 object-contain"
        style={{ width: iconWidth, height: iconHeight }}
      />
    </button>
  );
}

export default function Home({ navigate }) {
  const { data, online, busy, mutate } = useApp();
  const { pet, inventory, products, equipped } = data;
  const [effect, setEffect] = useState('');
  const [care, setCare] = useState(null);
  const [rename, setRename] = useState(false);
  const [name, setName] = useState(pet.name);
  const [customize, setCustomize] = useState(null);
  const [statusOpen, setStatusOpen] = useState(false);
  const [gesture, setGesture] = useState(null);
  const [clock, setClock] = useState(Date.now);
  const poseTimer = useRef(null);
  const latest = useRef(null);
  const foods = products
    .filter((product) => product.category === 'food')
    .map((product) => ({
      ...product,
      quantity: inventory.find((item) => item.product_id === product.id)?.quantity || 0,
    }));
  const foodStock = foods.reduce((total, product) => total + product.quantity, 0);
  const food =
    foods.find((product) => product.id === 'makanan' && product.quantity > 0) ||
    foods.find((product) => product.quantity > 0);
  latest.current = { energy: pet.energy, gesture, busy };
  function showPose(next) {
    clearTimeout(poseTimer.current);
    setGesture({ pose: next, expiresAt: Date.now() + POSE_DURATION_MS[next] });
    poseTimer.current = setTimeout(() => setGesture(null), POSE_DURATION_MS[next]);
  }
  useEffect(() => {
    const tick = setInterval(() => setClock(Date.now()), 1000);
    const greeting = setInterval(() => {
      const current = latest.current;
      if (
        !current.busy &&
        canGreet(
          current.energy,
          current.gesture,
          Date.now(),
          document.visibilityState === 'visible'
        )
      )
        showPose('greet');
    }, GREETING_INTERVAL_MS);
    return () => {
      clearInterval(tick);
      clearInterval(greeting);
      clearTimeout(poseTimer.current);
    };
  }, []);
  const pose = resolvePetPose(pet.energy, gesture, clock);
  const feedWait = pet.fed_at
    ? Math.min(30, Math.max(0, 30 - Math.floor((clock - new Date(pet.fed_at).getTime()) / 1000)))
    : 0;

  const feedbackTimer = useRef(null);
  useEffect(() => () => clearTimeout(feedbackTimer.current), []);
  const feedback = (text) => {
    clearTimeout(feedbackTimer.current);
    setEffect(text);
    feedbackTimer.current = setTimeout(() => setEffect(''), 2600);
  };
  // The badge reflects the collection already earned; it never changes coins or pet status.
  const level = 1 + Math.floor((data.collectionCount || 0) / 5);
  const mood = pet.energy < 30 ? 'Butuh makan' : pet.happiness < 30 ? 'Butuh teman' : 'Lagi santai';
  async function play() {
    showPose('comfort');
    feedback('Mrrp! Nyaman banget.');
    const last = new Date(pet.played_at || 0).getTime();
    if (online && !busy && (!last || Date.now() - last >= 30500))
      await mutate('/pet/play', {}, { action: 'pet-mymew' });
  }
  async function feed() {
    if (!online || busy) return;
    if (!food) {
      openStore('makanan');
      return;
    }
    if (feedWait > 0) return;
    await mutate(
      '/pet/feed',
      { product_id: food.id },
      {
        action: 'feed-pet',
        message: pet.name + ' sudah makan.',
        onSuccess: () => {
          showPose('happy');
          feedback('Nyam! Enak banget!');
        },
      }
    );
  }

  async function useItem(product) {
    await mutate(
      '/inventory/use',
      { product_id: product.id },
      {
        action: `use-${product.id}`,
        message: `${product.name} dipakai. ${product.category === 'food' ? 'Energy' : 'Clean'} bertambah!`,
        onSuccess: () => {
          setCare(null);
          feedback(product.category === 'food' ? 'Nyam! Enak banget!' : 'Segar dan wangi!');
        },
      }
    );
  }
  function openStore(productId) {
    setCustomize(null);
    setCare(null);
    navigate('store', { productId });
  }
  function openCare(category) {
    setStatusOpen(false);
    setCare(category);
  }

  return (
    <>
      <section
        aria-label="Rumah MyMew"
        className="mew-home-stage"
        data-mew-room={pet.room_id || 'hangat'}
      >
        <MewHomeRoom pet={pet} equipped={equipped} pose={pose}>
          {({ cat, bowl }) => (
            <>
              <div className="mew-home-identity flex items-center justify-between">
                <div className="flex items-center gap-[9px]">
                  <button
                    onClick={() => {
                      setName(pet.name);
                      setRename(true);
                    }}
                    aria-label={`Ubah nama ${pet.name}`}
                    className="mew-home-name truncate rounded tracking-[-.4px]"
                    disabled={!online}
                  >
                    {pet.name}
                  </button>
                  <span
                    title="Level bertambah setiap 5 koleksi"
                    className="flex items-center gap-1 rounded-[5px] bg-[#f4eddb] px-[6px] py-[3px] text-[8px] font-bold leading-3 text-[#b49964]"
                  >
                    <img src={mewUiAssets.level} alt="" width="12" height="12" />
                    Lv. {level}
                  </span>
                </div>
                <span className="mew-home-mood flex items-center gap-[6px] whitespace-nowrap text-[11px] leading-[15px]">
                  <i className="size-[5px] rounded-full bg-[#a3b18a]" />
                  {mood}
                </span>
              </div>
              <button
                type="button"
                onClick={() => setStatusOpen(true)}
                aria-label="Lihat semua status dan perawatan MyMew"
                className="mew-home-status flex flex-col gap-3 rounded-[14px] bg-white/90 text-left shadow-[0_0_4.5px_#00000040]"
              >
                <StatusBar
                  label="Energy"
                  value={pet.energy}
                  color="#dfba80"
                  icon={mewUiAssets.energy}
                />
                <StatusBar
                  label="Happiness"
                  value={pet.happiness}
                  color="#d8aaa1"
                  icon={mewUiAssets.heart}
                />
              </button>
              <div className="mew-home-actions flex gap-3">
                <SceneAction
                  label="Ganti ruangan"
                  icon={mewUiAssets.room}
                  background={mewUiAssets.roomCircle}
                  onClick={() => setCustomize('rooms')}
                />
                <SceneAction
                  label="Buka Mew Store"
                  icon={mewUiAssets.store}
                  background={mewUiAssets.actionCircle}
                  iconWidth={31}
                  iconHeight={30}
                  onClick={() => openStore()}
                />
                <SceneAction
                  label="Ganti jenis dan nama kucing"
                  icon={mewUiAssets.paw}
                  background={mewUiAssets.actionCircle}
                  iconWidth={40}
                  iconHeight={47}
                  onClick={() => setCustomize('cats')}
                />
              </div>
              <button
                type="button"
                aria-label={`Elus ${pet.name}`}
                title="Elus MyMew"
                disabled={!online || busy}
                onClick={play}
                className="absolute rounded-[42px] bg-transparent"
                style={cat}
              />
              <button
                type="button"
                disabled={!online || busy || (foodStock > 0 && feedWait > 0)}
                onClick={feed}
                style={{ position: 'absolute', ...bowl }}
                aria-label="Kasih makan MyMew"
                className="mew-bowl-action flex flex-col items-center disabled:opacity-60"
                data-mew-food-stock={foodStock}
              >
                <img
                  src={
                    foodStock > 0 ? '/mymew/revision-foodFull.svg' : '/mymew/revision-foodEmpty.svg'
                  }
                  alt={foodStock > 0 ? 'Mangkuk berisi makanan' : 'Mangkuk kosong'}
                  data-mew-bowl={foodStock > 0 ? 'full' : 'empty'}
                  className="pointer-events-none block h-auto w-full"
                />
                <span className="mt-1 grid min-h-11 w-full place-items-center rounded-full bg-[#fffdf7] px-2 text-[11px] font-extrabold text-[#c68e6c] shadow-sm">
                  {foodStock > 0 && feedWait > 0 ? 'Tunggu ' + feedWait + ' dtk' : 'Kasih Mam'}
                </span>
                <span className="mew-bowl-stock mt-1 whitespace-nowrap text-[10px] font-bold">
                  {foodStock > 0 ? 'Stok ' + foodStock + ' porsi' : 'Isi dari Store · 3 poin'}
                </span>
              </button>
              {effect && (
                <div
                  role="status"
                  className="mew-home-feedback pointer-events-none absolute flex min-h-10 items-center justify-center gap-2 rounded-2xl bg-[#fffcf3]/95 px-4 py-2 text-center text-[12px] font-bold text-[#947b5b] shadow-sm"
                >
                  <Heart size={15} className="shrink-0 text-[#d3958c]" fill="currentColor" />
                  {effect}
                </div>
              )}
            </>
          )}
        </MewHomeRoom>
      </section>
      {customize && (
        <Suspense fallback={null}>
          <MewCustomization
            mode={customize}
            onClose={() => setCustomize(null)}
            onStore={openStore}
          />
        </Suspense>
      )}
      {rename && (
        <Modal title="Nama kecil, penuh sayang" onClose={() => setRename(false)}>
          <form
            onSubmit={(event) => {
              event.preventDefault();
              mutate(
                '/pet',
                { name },
                {
                  method: 'PATCH',
                  message: 'Nama MyMew berhasil diubah.',
                  onSuccess: () => setRename(false),
                }
              );
            }}
          >
            <label className="label">
              Nama MyMew
              <input
                className="input mt-2"
                value={name}
                onChange={(event) => setName(event.target.value)}
                maxLength={40}
                required
              />
            </label>
            <Button className="mt-5 w-full" busy={busy} disabled={!online}>
              Simpan nama
            </Button>
          </form>
        </Modal>
      )}
      {statusOpen && (
        <Modal title={`Gimana ${pet.name}?`} onClose={() => setStatusOpen(false)}>
          <p className="mb-6 text-sm leading-6 text-muted">
            Sedikit perhatian bikin harinya lebih menyenangkan.
          </p>
          <div className="space-y-5">
            {[
              { field: 'energy', label: 'Energy', Icon: Zap, color: '#dfba80' },
              { field: 'clean', label: 'Clean', Icon: Droplet, color: '#a6bfaf' },
              { field: 'happiness', label: 'Happiness', Icon: Heart, color: '#d8aaa1' },
            ].map(({ field, label, Icon, color }) => (
              <div key={field}>
                <div className="mb-2 flex items-center justify-between text-xs">
                  <span className="flex items-center gap-2 font-bold">
                    <Icon size={16} style={{ color }} />
                    {label}
                  </span>
                  <strong>{pet[field]} /100</strong>
                </div>
                <div
                  role="progressbar"
                  aria-label={label}
                  aria-valuenow={pet[field]}
                  aria-valuemin={0}
                  aria-valuemax={100}
                  className="h-2 overflow-hidden rounded-full bg-[#f0eee5]"
                >
                  <div
                    className="h-full rounded-full"
                    style={{ width: `${pet[field]}%`, backgroundColor: color }}
                  />
                </div>
              </div>
            ))}
          </div>
          <div className="mt-7 grid gap-2 sm:grid-cols-3">
            <Button
              variant="secondary"
              disabled={!online}
              onClick={() => {
                setStatusOpen(false);
                feed();
              }}
            >
              Kasih makan
            </Button>
            <Button variant="secondary" disabled={!online} onClick={() => openCare('care')}>
              Mandikan
            </Button>
            <Button
              variant="secondary"
              disabled={!online}
              busy={busy}
              onClick={() => {
                setStatusOpen(false);
                play();
              }}
            >
              Main bareng
            </Button>
          </div>
        </Modal>
      )}
      {care && (
        <Modal
          title={care === 'food' ? 'Camilan untuk si kesayangan' : 'Waktunya bersih-bersih'}
          onClose={() => setCare(null)}
        >
          <p className="mb-5 text-sm text-muted">Pilih barang dari tasmu.</p>
          <div className="space-y-3">
            {products
              .filter((product) => product.category === care)
              .map((product) => {
                const quantity =
                  inventory.find((item) => item.product_id === product.id)?.quantity || 0;
                return (
                  <div
                    key={product.id}
                    className="flex items-center gap-3 rounded-2xl border border-line p-3"
                  >
                    <span className="text-3xl">{product.emoji}</span>
                    <div className="flex-1">
                      <h3 className="text-sm font-extrabold">{product.name}</h3>
                      <p className="mt-1 text-xs text-muted">
                        Stok {quantity} · +{product.effect} {care === 'food' ? 'Energy' : 'Clean'}
                      </p>
                    </div>
                    <Button
                      variant="secondary"
                      disabled={!online || !quantity}
                      busy={busy}
                      onClick={() => useItem(product)}
                    >
                      Pakai
                    </Button>
                  </div>
                );
              })}
          </div>
          <button
            type="button"
            onClick={() => openStore()}
            className="mt-6 flex w-full items-center justify-center gap-2 py-2 text-sm font-bold text-[#9b9e7e]"
          >
            <ShoppingBag size={16} />
            Isi tas di Store
            <ArrowRight size={15} />
          </button>
        </Modal>
      )}
    </>
  );
}
