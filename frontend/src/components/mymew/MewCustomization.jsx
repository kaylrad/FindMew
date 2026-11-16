import React, { useEffect, useId, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Check, ChevronLeft, LockKeyhole, LoaderCircle } from 'lucide-react';
import { useApp } from '../../context';
import MewScene from './MewScene';
import MewAccessoryArt, { mewAccessoryAspect } from './MewAccessoryArt';
import { mewCats, mewRooms, mewAccessories } from '../../lib/mymew-catalog';
import './mew-customization.css';

const accessoryById = new Map(mewAccessories.map((item) => [item.id, item]));

function SelectionMark() {
  return (
    <span className="mew-choice-check" aria-hidden="true">
      <Check size={12} strokeWidth={3} />
    </span>
  );
}

export default function MewCustomization({ mode, onClose, onStore }) {
  const { data, online, busy, mutate } = useApp();
  const { pet, inventory, products, equipped } = data;
  const [choice, setChoice] = useState(() =>
    mode === 'rooms' ? pet.room_id || 'hangat' : pet.cat_type_id || 'oyen'
  );
  const [draftName, setDraftName] = useState(pet.name);
  const [loadout, setLoadout] = useState(() =>
    equipped.filter((item) => ['head', 'face'].includes(item.slot)).map((item) => item.product_id)
  );
  const [category, setCategory] = useState('all');
  const panel = useRef(null);
  const closeRef = useRef(onClose);
  const busyRef = useRef(busy);
  const titleId = useId();
  closeRef.current = onClose;
  busyRef.current = busy;

  useEffect(() => {
    const previous = document.activeElement;
    const overflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    panel.current?.focus();
    const keydown = (event) => {
      if (event.key === 'Escape' && !busyRef.current) {
        event.preventDefault();
        closeRef.current();
        return;
      }
      if (event.key !== 'Tab') return;
      const controls = [
        ...panel.current.querySelectorAll(
          'button:not(:disabled),input:not(:disabled),a[href],[tabindex="0"]'
        ),
      ];
      const first = controls[0];
      const last = controls.at(-1);
      if (!first) {
        event.preventDefault();
        return;
      }
      if (
        event.shiftKey &&
        (document.activeElement === first || document.activeElement === panel.current)
      ) {
        event.preventDefault();
        last.focus();
      } else if (
        !event.shiftKey &&
        (document.activeElement === last || document.activeElement === panel.current)
      ) {
        event.preventDefault();
        first.focus();
      }
    };
    document.addEventListener('keydown', keydown);
    return () => {
      document.body.style.overflow = overflow;
      document.removeEventListener('keydown', keydown);
      if (previous?.isConnected) previous.focus();
    };
  }, []);

  const owned = (id) => (inventory.find((item) => item.product_id === id)?.quantity || 0) > 0;
  const slotFor = (id) =>
    accessoryById.get(id)?.slot || equipped.find((item) => item.product_id === id)?.slot;
  const selectedCat =
    mewCats.find((item) => item.id === (mode === 'cats' ? choice : pet.cat_type_id)) || mewCats[0];
  const selectedRoom =
    mewRooms.find((item) => item.id === (mode === 'rooms' ? choice : pet.room_id)) || mewRooms[0];
  const validName = draftName.trim().length > 0 && draftName.trim().length <= 40;
  const previewPet = {
    ...pet,
    name: mode === 'cats' ? draftName.trim() || pet.name : pet.name,
    cat_type_id: selectedCat.id,
    room_id: selectedRoom.id,
  };
  const selectedAccessories = loadout.map((id) => accessoryById.get(id)).filter(Boolean);
  const previewEquipped =
    mode === 'accessories'
      ? [
          ...equipped.filter((item) => !['head', 'face'].includes(item.slot)),
          ...loadout.map((id) => ({ product_id: id, slot: slotFor(id) })),
        ]
      : equipped;
  const title =
    mode === 'cats'
      ? 'Teman kecilmu'
      : mode === 'rooms'
        ? `Rumah untuk ${pet.name}`
        : `Lemari ${pet.name}`;
  const subtitle =
    mode === 'cats'
      ? 'Pilih kucing yang paling kamu suka.'
      : mode === 'rooms'
        ? 'Sudut nyaman untuk si kesayangan.'
        : null;
  const previewName =
    mode === 'cats'
      ? selectedCat.name
      : mode === 'rooms'
        ? `Ruangan ${selectedRoom.name.toLowerCase()}`
        : `${pet.name} · ${selectedCat.name}`;
  const previewCaption =
    mode === 'accessories'
      ? selectedAccessories.map((item) => item.name).join(' + ') ||
        (loadout.length ? 'Aksesori klasik dipertahankan' : 'Tanpa aksesori')
      : `${previewName} · Dipilih`;
  const options = mode === 'cats' ? mewCats : mewRooms;
  const visibleAccessories = mewAccessories.filter(
    (item) => category === 'all' || item.slot === category
  );

  function chooseAccessory(item) {
    if (busy) return;
    if (!owned(item.id)) {
      onStore?.(item.id);
      return;
    }
    setLoadout((current) =>
      current.includes(item.id)
        ? current.filter((id) => id !== item.id)
        : [...current.filter((id) => slotFor(id) !== item.slot), item.id]
    );
  }
  async function save() {
    if (!online || busy) return;
    if (mode === 'accessories') {
      if (loadout.some((id) => !owned(id))) return;
      await mutate(
        '/accessories/loadout',
        { product_ids: loadout },
        {
          method: 'PUT',
          action: 'save-mew-loadout',
          message: 'Penampilan MyMew berhasil disimpan.',
          onSuccess: onClose,
        }
      );
    } else {
      if (mode === 'cats' && !validName) return;
      const body =
        mode === 'cats' ? { cat_type_id: choice, name: draftName.trim() } : { room_id: choice };
      await mutate('/pet', body, {
        method: 'PATCH',
        action: `save-mew-${mode}`,
        message:
          mode === 'cats'
            ? 'Jenis dan nama MyMew berhasil disimpan.'
            : 'Ruangan baru MyMew berhasil disimpan.',
        onSuccess: onClose,
      });
    }
  }

  return createPortal(
    <div
      className="mew-customization-overlay"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget && !busy) onClose();
      }}
    >
      <section
        ref={panel}
        tabIndex={-1}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        className="mew-customization"
      >
        <div className="mew-customization-preview">
          <MewScene pet={previewPet} equipped={previewEquipped} variant="preview" />
          <header className="mew-customization-heading">
            <button
              type="button"
              className="mew-customization-back"
              aria-label="Kembali ke MyMew tanpa menyimpan"
              onClick={onClose}
              disabled={busy}
            >
              <ChevronLeft size={24} strokeWidth={3} />
            </button>
            <div>
              <h1 id={titleId}>{title}</h1>
              {subtitle && <p>{subtitle}</p>}
            </div>
          </header>
          <div className="mew-preview-name">{previewName}</div>
          <p className="mew-preview-caption" role="status" aria-live="polite">
            {previewCaption}
          </p>
        </div>
        <div className={`mew-customization-options mew-customization-${mode}`}>
          <div className="mew-options-heading">
            <h2>
              {mode === 'cats'
                ? 'Pilih jenis kucing'
                : mode === 'rooms'
                  ? 'Pilih ruangan'
                  : 'Pilih aksesori'}
            </h2>
            <span>
              {mode === 'cats'
                ? `${mewCats.length} pilihan`
                : mode === 'rooms'
                  ? `${mewRooms.length} pilihan`
                  : `${mewAccessories.filter((item) => owned(item.id)).length} dimiliki · ${mewAccessories.length} koleksi`}
            </span>
          </div>
          {mode !== 'accessories' && (
            <p className="mew-options-description">
              {mode === 'cats'
                ? 'Empat corak, sama-sama menggemaskan.'
                : `Beri ${pet.name} suasana yang terasa seperti rumah.`}
            </p>
          )}
          {mode === 'cats' && (
            <label className="mew-name-control">
              Nama MyMew
              <input
                type="text"
                name="mewName"
                value={draftName}
                onChange={(event) => setDraftName(event.target.value)}
                disabled={busy}
                maxLength={40}
                minLength={1}
                required
                autoComplete="off"
                aria-invalid={!validName}
                aria-describedby={titleId + '-name-help'}
              />
              <span id={titleId + '-name-help'}>
                {validName
                  ? 'Nama dan jenis kucing disimpan bersama.'
                  : 'Isi nama MyMew (1–40 karakter).'}
              </span>
            </label>
          )}
          {mode === 'accessories' ? (
            <>
              <div className="mew-accessory-categories" role="group" aria-label="Kategori aksesori">
                {[
                  ['all', 'Semua'],
                  ['head', 'Topi'],
                  ['face', 'Kacamata'],
                ].map(([id, label]) => (
                  <button
                    type="button"
                    key={id}
                    aria-pressed={category === id}
                    onClick={() => setCategory(id)}
                  >
                    {label}
                  </button>
                ))}
              </div>
              <div className="mew-accessory-grid" role="group" aria-label="Pilihan aksesori MyMew">
                {visibleAccessories.map((item) => {
                  const isOwned = owned(item.id);
                  const selected = loadout.includes(item.id);
                  const price =
                    products.find((product) => product.id === item.id)?.price ?? item.price;
                  return (
                    <button
                      type="button"
                      key={item.id}
                      disabled={busy}
                      aria-pressed={selected}
                      aria-label={`${item.name}${isOwned ? (selected ? ', dipilih, ketuk untuk melepas' : ', dimiliki') : `, belum dimiliki, ${price} koin, buka Store`}`}
                      onClick={() => chooseAccessory(item)}
                      className={`mew-accessory-card ${selected ? 'is-selected' : ''} ${!isOwned ? 'is-locked' : ''}`}
                    >
                      <span className={`mew-accessory-art mew-accessory-art-${item.slot}`}>
                        <MewAccessoryArt
                          item={item}
                          alt=""
                          style={{
                            width: Math.min(
                              item.slot === 'head' ? 61 : 70,
                              41 * mewAccessoryAspect(item)
                            ),
                            maxWidth: '100%',
                          }}
                        />
                      </span>
                      <span className="mew-accessory-title">{item.name}</span>
                      {selected ? (
                        <SelectionMark />
                      ) : !isOwned ? (
                        <LockKeyhole className="mew-accessory-lock" size={13} aria-hidden="true" />
                      ) : null}
                      {!isOwned && (
                        <span className="mew-accessory-price">{price} koin · Store</span>
                      )}
                    </button>
                  );
                })}
              </div>
            </>
          ) : (
            <div
              className={`mew-choice-grid mew-choice-grid-${mode}`}
              role="radiogroup"
              aria-label={mode === 'cats' ? 'Jenis kucing' : 'Ruangan MyMew'}
            >
              {options.map((item) => (
                <label
                  key={item.id}
                  className={`mew-choice-card ${choice === item.id ? 'is-selected' : ''}`}
                >
                  <input
                    className="mew-choice-input"
                    type="radio"
                    name={`mew-${mode}`}
                    value={item.id}
                    checked={choice === item.id}
                    disabled={busy}
                    onChange={() => setChoice(item.id)}
                  />
                  {mode === 'cats' ? (
                    <img className="mew-cat-thumbnail" src={item.src} alt="" />
                  ) : (
                    <span className="mew-room-thumbnail">
                      <img src={item.src} alt="" />
                    </span>
                  )}
                  <span className="mew-choice-name">{item.name}</span>
                  <span className="mew-choice-description">{item.description}</span>
                  {choice === item.id && <SelectionMark />}
                </label>
              ))}
            </div>
          )}
          {!online && (
            <p role="status" className="mew-customization-offline">
              Hubungkan internet untuk menyimpan pilihanmu.
            </p>
          )}
          <button
            type="button"
            className="mew-customization-save"
            disabled={!online || busy || (mode === 'cats' && !validName)}
            onClick={save}
          >
            {busy && <LoaderCircle className="animate-spin" size={17} />}{' '}
            {mode === 'cats'
              ? 'Gunakan kucing ini'
              : mode === 'rooms'
                ? 'Gunakan ruangan ini'
                : 'Simpan penampilan'}
          </button>
        </div>
      </section>
    </div>,
    document.body
  );
}
