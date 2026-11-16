import React, { Suspense, lazy, useEffect, useState } from 'react';
import { ShoppingBag, ArrowLeft, Check, Backpack, Sparkles } from 'lucide-react';
import { useApp } from '../context';
import { Button, Coin, Modal, Empty } from '../components/ui';

const MewCustomization = lazy(() => import('../components/mymew/MewCustomization'));
import MewAccessoryArt, { mewAccessoryAspect } from '../components/mymew/MewAccessoryArt';
import { mewAccessories } from '../lib/mymew-catalog';

const accessoryArt = new Map(mewAccessories.map((item) => [item.id, item]));

function ProductArt({ product, large = false }) {
  const accessory = accessoryArt.get(product.id);
  const artWidth = accessory
    ? Math.min(large ? 210 : 165, (large ? 150 : 112) * mewAccessoryAspect(accessory))
    : 0;
  if (product.category === 'food')
    return (
      <img
        src="/mymew/revision-foodFull.svg"
        alt={product.name}
        className="relative block h-auto"
        style={{ width: large ? 'min(85%, 250px)' : 'min(85%, 185px)' }}
      />
    );
  return accessory ? (
    <MewAccessoryArt
      item={accessory}
      alt={product.name}
      className="relative"
      style={{ width: 'min(80%, ' + artWidth + 'px)' }}
    />
  ) : (
    <span className="relative text-7xl drop-shadow-sm" role="img" aria-label={product.name}>
      {product.emoji}
    </span>
  );
}

export default function Store({ navigate, initialProductId }) {
  const { data, online, busy, mutate } = useApp();
  const [category, setCategory] = useState('all');
  const [bag, setBag] = useState(false);
  const [bagCategory, setBagCategory] = useState('accessory');
  const [selected, setSelected] = useState(null);
  const [appearanceOpen, setAppearanceOpen] = useState(false);
  const [foodPurchased, setFoodPurchased] = useState(false);
  const { products, inventory, equipped, profile } = data;
  const stock = (id) => inventory.find((item) => item.product_id === id)?.quantity || 0;
  const worn = (id) => equipped.some((item) => item.product_id === id);
  const isFigmaAccessory = (product) =>
    product.category === 'accessory' && accessoryArt.has(product.id);
  const saleProducts = products.filter(
    (product) =>
      !product.archived &&
      (isFigmaAccessory(product) || (product.id === 'makanan' && product.category === 'food'))
  );
  const bagProducts = products.filter((product) => stock(product.id) > 0);
  const foodStock = products
    .filter((product) => product.category === 'food')
    .reduce((quantity, product) => quantity + stock(product.id), 0);
  const items = bag
    ? bagProducts.filter((product) =>
        bagCategory === 'classic'
          ? product.category === 'accessory' && !isFigmaAccessory(product)
          : bagCategory === 'accessory'
            ? isFigmaAccessory(product)
            : product.category === bagCategory
      )
    : saleProducts.filter(
        (product) =>
          category === 'all' ||
          (category === 'food'
            ? product.category === 'food'
            : accessoryArt.get(product.id)?.slot === category)
      );
  const tabs = bag
    ? [
        ['accessory', 'Aksesoris'],
        ['food', 'Makanan'],
        ['care', 'Perawatan'],
        ['classic', 'Koleksi lama'],
      ]
    : [
        ['all', 'Semua'],
        ['food', 'Makanan'],
        ['head', 'Topi'],
        ['face', 'Kacamata'],
      ];

  function openProduct(id) {
    const product = saleProducts.find((item) => item.id === id);
    if (!product) return;
    setAppearanceOpen(false);
    if (product.category === 'accessory' && stock(product.id) > 0) {
      setBag(true);
      setBagCategory('accessory');
      setSelected(null);
    } else {
      setBag(false);
      setCategory(product.category === 'food' ? 'food' : accessoryArt.get(id)?.slot || 'all');
      setSelected(product);
    }
  }
  useEffect(() => {
    if (initialProductId) openProduct(initialProductId);
  }, [initialProductId]);

  async function use(product) {
    if (product.category === 'food') {
      navigate('home');
      return;
    }
    await mutate(
      '/inventory/use',
      { product_id: product.id },
      { action: 'use-' + product.id, message: product.name + ' dipakai. Status MyMew bertambah!' }
    );
  }
  async function equip(product) {
    await mutate(
      '/accessories',
      { product_id: product.id, equipped: !worn(product.id) },
      {
        method: 'PUT',
        action: 'equip-' + product.id + '-' + !worn(product.id),
        message: worn(product.id)
          ? 'Aksesoris dilepas.'
          : 'Aksesoris terpasang. Lihat penampilan MyMew!',
      }
    );
  }

  return (
    <>
      <button
        onClick={() => navigate('home')}
        className="mb-5 flex items-center gap-1.5 text-muted"
      >
        <ArrowLeft size={14} />
        <span className="text-xs font-bold">Kembali ke MyMew</span>
      </button>
      <p className="eyebrow">KECIL-KECIL, BIKIN SENANG</p>
      <div className="mt-3 flex items-center justify-between gap-3">
        <h1 className="page-title">{bag ? 'Tas kecilmu' : 'Mew Store'}</h1>
        <div className="rounded-full bg-[#f4ecd7] px-4 py-2.5">
          <Coin value={profile.coins} />
        </div>
      </div>
      <p className="mt-2 text-sm text-muted">
        {bag
          ? 'Koleksi dan barang yang sudah kamu miliki.'
          : 'Isi stok makanan, pilih topi, dan kacamata untuk si kesayangan.'}
      </p>
      <p
        className="mt-3 text-xs font-bold text-[#8b967a]"
        aria-label={'Stok makanan ' + foodStock + ' porsi'}
      >
        Stok makanan: {foodStock} porsi
      </p>
      {foodPurchased && (
        <div
          role="status"
          className="mt-5 flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-[#dce3d0] bg-[#edf1e5] p-4"
        >
          <p className="text-xs leading-6 text-[#758664]">
            <strong>Makanan sudah masuk ke tas.</strong>
            <br />
            Kembali ke MyMew, lalu tekan Kasih Mam untuk memakai 1 porsi.
          </p>
          <Button variant="secondary" onClick={() => navigate('home')}>
            Kembali untuk kasih mam
            <ArrowLeft size={14} />
          </Button>
        </div>
      )}
      <div className="my-6 flex flex-wrap items-center justify-between gap-3">
        <div
          className="flex max-w-full flex-wrap rounded-2xl bg-[#efeee5] p-1"
          role="group"
          aria-label={bag ? 'Kategori tas' : 'Kategori Store'}
        >
          {tabs.map(([id, label]) => (
            <button
              key={id}
              onClick={() => (bag ? setBagCategory(id) : setCategory(id))}
              aria-pressed={(bag ? bagCategory : category) === id}
              className={
                'rounded-full px-4 py-2.5 ' +
                ((bag ? bagCategory : category) === id ? 'bg-white shadow-sm' : 'text-muted')
              }
            >
              <span className="text-xs font-bold">{label}</span>
            </button>
          ))}
        </div>
        <button
          className={
            'flex items-center gap-2 rounded-full border px-4 py-2.5 ' +
            (bag ? 'border-[#a5b594] bg-[#edf1e5]' : 'border-line bg-white')
          }
          onClick={() => setBag((value) => !value)}
        >
          {bag ? <ShoppingBag size={15} /> : <Backpack size={15} />}
          <span className="text-xs font-extrabold">{bag ? 'Lihat Store' : 'Tas saya'}</span>
        </button>
      </div>
      <button
        type="button"
        aria-label="Atur penampilan MyMew"
        onClick={() => setAppearanceOpen(true)}
        className="mb-6 flex min-h-12 w-full items-center justify-between gap-4 rounded-2xl border border-[#dce3d0] bg-[#edf1e5] px-4 py-3 text-left"
      >
        <span className="flex items-center gap-3">
          <Sparkles size={21} className="shrink-0 text-[#8a9b73]" />
          <span>
            <strong className="block text-sm font-extrabold">Atur penampilan MyMew</strong>
            <span className="mt-1 block text-[11px] leading-5 text-[#8b967a]">
              Coba dan pasang koleksi topi serta kacamata.
            </span>
          </span>
        </span>
        <ArrowLeft size={17} className="rotate-180 text-[#8a9b73]" />
      </button>
      {items.length ? (
        <div className="grid grid-cols-2 gap-3 md:grid-cols-3 md:gap-5">
          {items.map((product, index) => {
            const classic = product.category === 'accessory' && !isFigmaAccessory(product);
            return (
              <article
                key={product.id}
                className="card overflow-hidden p-3.5 md:p-5"
                data-product-id={product.id}
              >
                <div
                  className={
                    'relative mb-4 flex aspect-[1.3] items-center justify-center overflow-hidden rounded-xl ' +
                    ['bg-[#f3ead9]', 'bg-[#eaf0e5]', 'bg-[#f5e5df]'][index % 3]
                  }
                >
                  <div className="absolute h-24 w-24 rounded-full bg-white/35" />
                  <ProductArt product={product} />
                  {stock(product.id) > 0 && (
                    <span className="absolute right-2 top-2 rounded-full bg-white/80 px-2 py-1 text-[9px] font-extrabold">
                      {worn(product.id) ? 'Terpasang' : stock(product.id) + ' di tas'}
                    </span>
                  )}
                </div>
                <h2 className="text-sm font-extrabold md:text-base">{product.name}</h2>
                <p className="mt-1.5 min-h-10 text-[11px] leading-5 text-muted">
                  {product.description}
                </p>
                {bag ? (
                  <p className="mt-4 text-xs font-semibold text-muted">
                    {classic ? 'Koleksi klasik' : stock(product.id) + ' dimiliki'}
                  </p>
                ) : (
                  <div className="mt-4">
                    <Coin value={product.price} className="text-sm" />
                  </div>
                )}
                {bag ? (
                  <Button
                    className="mt-4 w-full"
                    variant="secondary"
                    disabled={!online || (classic && !worn(product.id))}
                    busy={busy}
                    onClick={() =>
                      product.category === 'accessory' ? equip(product) : use(product)
                    }
                  >
                    {worn(product.id) && <Check size={14} />}
                    {classic
                      ? worn(product.id)
                        ? 'Lepas'
                        : 'Koleksi lama'
                      : product.category === 'accessory'
                        ? worn(product.id)
                          ? 'Lepas'
                          : 'Pasang'
                        : product.category === 'food'
                          ? 'Beri makan di MyMew'
                          : 'Pakai sekarang'}
                  </Button>
                ) : (
                  <Button
                    className="mt-4 w-full"
                    variant="secondary"
                    onClick={() => setSelected(product)}
                    disabled={
                      !online || busy || (product.category === 'accessory' && stock(product.id) > 0)
                    }
                  >
                    {product.category === 'food'
                      ? 'Beli 1 porsi'
                      : stock(product.id) > 0
                        ? 'Sudah dimiliki'
                        : 'Beli'}
                  </Button>
                )}
              </article>
            );
          })}
        </div>
      ) : (
        <Empty icon={Backpack} title={bag ? 'Tasmu masih lapang' : 'Belum ada pilihan di sini'}>
          {bag
            ? 'Belum ada barang dalam kategori ini. Pilih makanan, topi, atau kacamata di Store untuk menambah koleksi.'
            : 'Coba kategori lainnya atau muat ulang setelah kembali online.'}
        </Empty>
      )}
      {appearanceOpen && (
        <Suspense fallback={null}>
          <MewCustomization
            mode="accessories"
            onClose={() => setAppearanceOpen(false)}
            onStore={openProduct}
          />
        </Suspense>
      )}
      {selected && (
        <Modal
          title={selected.category === 'food' ? 'Isi mangkuk MyMew' : 'Hadiah buat si kesayangan'}
          onClose={() => {
            if (!busy) setSelected(null);
          }}
        >
          <div className="mb-5 flex min-h-40 items-center justify-center rounded-2xl bg-[#f4eddf] p-7">
            <ProductArt product={selected} large />
          </div>
          <h3 className="text-lg font-extrabold">{selected.name}</h3>
          <p className="mt-2 text-sm leading-6 text-muted">{selected.description}</p>
          {selected.category === 'food' && (
            <p className="mt-3 text-xs leading-6 text-[#818b72]">
              1 pembelian menambah 1 porsi. Stok saat ini: {stock(selected.id)} porsi.
            </p>
          )}
          <div className="my-5 flex justify-between rounded-xl bg-[#f7f5ed] p-4 text-sm">
            <span>Harga</span>
            <Coin value={selected.price} />
          </div>
          <p className="mb-5 text-xs text-muted">
            Saldo setelah pembelian:{' '}
            <strong>{Math.max(0, profile.coins - selected.price)} koin</strong>
          </p>
          {profile.coins < selected.price && (
            <p className="mb-4 rounded-xl bg-[#fae9e2] p-3 text-xs text-[#b47e64]">
              Koin belum cukup. Abadikan Mew untuk mendapatkan koin.
            </p>
          )}
          <Button
            className="w-full"
            busy={busy}
            disabled={
              !online ||
              profile.coins < selected.price ||
              (selected.category === 'accessory' && stock(selected.id) > 0)
            }
            onClick={() =>
              mutate(
                '/purchases',
                { product_id: selected.id },
                {
                  action: 'buy-' + selected.id,
                  message: selected.name + ' sudah masuk ke tasmu!',
                  onSuccess: () => {
                    const food = selected.category === 'food';
                    setSelected(null);
                    if (food) {
                      setBag(false);
                      setCategory('food');
                      setFoodPurchased(true);
                    } else {
                      setBag(true);
                      setBagCategory('accessory');
                    }
                  },
                }
              )
            }
          >
            Konfirmasi pembelian
          </Button>
        </Modal>
      )}
    </>
  );
}
