import React from 'react';
import { Lock, Globe } from 'lucide-react';
export default function CollectionFields({ form, change }) {
  return (
    <div className="space-y-4">
      <label className="label">
        Nama si Mew
        <input
          className="input mt-2"
          name="name"
          placeholder="Siapa nama teman barumu?"
          maxLength={80}
          required
          value={form.name}
          onChange={change}
        />
      </label>
      <label className="label">
        Cerita kecil <span className="font-normal text-muted">(opsional)</span>
        <textarea
          className="input mt-2 min-h-24 resize-y"
          name="notes"
          placeholder="Ketemu di mana? Seperti apa dia?"
          maxLength={1000}
          value={form.notes}
          onChange={change}
        />
      </label>
      <fieldset>
        <legend className="label mb-2">Siapa yang boleh melihat?</legend>
        <div className="grid grid-cols-2 gap-3">
          {[
            ['private', 'Privat', 'Hanya untukmu', Lock],
            ['public', 'Publik', 'Bagikan di map', Globe],
          ].map(([id, label, sub, Icon]) => (
            <label
              key={id}
              className={`flex cursor-pointer items-center gap-2.5 rounded-xl border p-3 ${form.visibility === id ? 'border-[#aab69b] bg-[#f0f3e8]' : 'border-line'}`}
            >
              <input
                type="radio"
                name="visibility"
                value={id}
                checked={form.visibility === id}
                onChange={change}
                className="accent-[#869573]"
              />
              <Icon size={16} className="shrink-0 text-[#969d85]" />
              <span>
                <span className="block text-xs font-extrabold">{label}</span>
                <span className="text-[10px] text-muted">{sub}</span>
              </span>
            </label>
          ))}
        </div>
      </fieldset>
    </div>
  );
}
