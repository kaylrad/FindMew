import React from 'react';
import { Home, Heart, Sparkles } from 'lucide-react';
export function Cat({ equipped = [], effect = '', className = '' }) {
  const neck = equipped.find((e) => e.slot === 'neck')?.product_id,
    head = equipped.find((e) => e.slot === 'head')?.product_id;
  return (
    <svg
      className={`${className} ${effect ? 'cat-bounce' : ''}`}
      viewBox="0 0 320 300"
      fill="none"
      role="img"
      aria-label={`Kucing digital Mochi${neck ? ', memakai ' + neck : ''}${head ? ', memakai mahkota bunga' : ''}`}
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
      {effect ? (
        <path
          d="M117 132q6-9 13 0m62 0q7-9 14 0"
          stroke="#624631"
          strokeWidth="4"
          strokeLinecap="round"
        />
      ) : (
        <g fill="#624631">
          <ellipse cx="123" cy="130" rx="5" ry="7" />
          <ellipse cx="199" cy="130" rx="5" ry="7" />
          <circle cx="125" cy="128" r="1.5" fill="white" />
          <circle cx="201" cy="128" r="1.5" fill="white" />
        </g>
      )}
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
      {neck === 'bandana' && (
        <path d="M113 201q48 20 96 0l-48 39Z" fill="#87a385" stroke="#617f61" strokeWidth="2" />
      )}
      {neck === 'bow' && (
        <g fill="#df9b9c" stroke="#bd777e" strokeWidth="2">
          <path d="M160 213q-40-33-39 0-1 33 39 0m0 0q40-33 39 0 1 33-39 0" />
          <circle cx="160" cy="213" r="7" />
        </g>
      )}
      {head === 'flower' && (
        <g>
          {[110, 136, 163, 190, 215].map((x, i) => (
            <g key={x} transform={`translate(${x} ${i === 0 || i === 4 ? 65 : 54})`}>
              <circle r="13" fill="#fff3d4" />
              <circle r="6" fill="#e5b453" />
            </g>
          ))}
        </g>
      )}
    </svg>
  );
}
export default function CatRoom({ pet, equipped, effect = '' }) {
  return (
    <div className="pet-room relative isolate overflow-hidden rounded-2xl bg-[#f5e9d9]">
      <div className="absolute left-5 top-5 z-10 rounded-full bg-white/65 px-3 py-1.5 text-[10px] font-semibold text-[#8f907a]">
        <Home className="mr-1 inline" size={11} /> Rumah {pet.name}
      </div>
      <svg
        viewBox="0 0 720 390"
        preserveAspectRatio="xMidYMid slice"
        className="room-background absolute inset-0 h-full w-full"
        aria-hidden="true"
      >
        <defs>
          <linearGradient id="wall" x2="0" y2="1">
            <stop stopColor="#f8eee1" />
            <stop offset="1" stopColor="#f0e1cc" />
          </linearGradient>
          <clipPath id="window">
            <path d="M51 88a62 62 0 0 1 124 0v146H51Z" />
          </clipPath>
        </defs>
        <path fill="url(#wall)" d="M0 0h720v390H0z" />
        <path fill="#eadcc4" d="M0 302h720v88H0z" />
        <path d="M0 304h720" stroke="#e2d0b4" strokeWidth="7" />
        <g clipPath="url(#window)">
          <path d="M40 20h150v225H40z" fill="#d6e2ce" />
          <circle cx="131" cy="86" r="24" fill="#fbebad" />
          <path d="M30 185q74-93 161 6v65H30" fill="#bacdb1" />
          <path d="M35 202q85-48 153 6v45H35" fill="#9fb795" />
        </g>
        <path d="M51 234V88a62 62 0 0 1 124 0v146Z" stroke="#d2bba0" strokeWidth="7" fill="none" />
        <path d="M113 31v203m-62-97h124" stroke="#faf4e6" strokeWidth="6" />
        <path d="M42 238h143" stroke="#c5a98a" strokeWidth="9" strokeLinecap="round" />
        <path d="M60 292h105v9H60z" fill="#c2a17d" />
        <path d="M68 301v38m87-38v38" stroke="#c2a17d" strokeWidth="6" />
        <path d="M83 284h34v8H83z" fill="#9caf94" />
        <path d="M80 275h39v8H80z" fill="#e6a384" />
        <path d="M83 267h34v7H83z" fill="#ecdbaa" />
        <path d="M582 96h65v81h-65z" fill="#d6b99b" />
        <path d="M587 101h55v71h-55z" fill="#fff9ec" />
        <path d="m605 124-2 21q12 17 23 0l-1-21-10 6Z" fill="#dcac71" />
        <path d="M574 182h80" stroke="#cbb294" strokeWidth="5" strokeLinecap="round" />
        <path d="M592 286h46l-9 48h-29z" fill="#cb9c7e" />
        <path d="M613 288v-67" stroke="#7f9c77" strokeWidth="4" />
        <path
          d="M613 265q-45-4-30-35 31 1 30 35m2-23q1-42 26-36 5 31-26 36m-1-3q-35-9-29-33 30 0 29 33"
          fill="#87a680"
        />
        <ellipse cx="363" cy="344" rx="145" ry="32" fill="#e1c99f" opacity=".5" />
        <ellipse cx="363" cy="340" rx="128" ry="24" fill="none" stroke="#ead9b7" strokeWidth="3" />
        <ellipse cx="665" cy="340" rx="28" ry="9" fill="#d3d6b8" />
        <path d="M640 335q25 12 50 0l-7 17q-17 9-36 0Z" fill="#99b291" />
        <ellipse cx="665" cy="334" rx="25" ry="7" fill="#c4d1b7" />
      </svg>
      <div className="absolute left-1/2 top-[18%] z-10 -translate-x-1/2 whitespace-nowrap rounded-xl rounded-bl-none bg-[#fffdf5] px-4 py-2 text-xs text-[#9a8a6f] shadow-sm">
        {effect || 'Hari yang purr-fect bareng kamu!'} <span className="text-[#d3aa72]">♡</span>
      </div>
      <Cat
        equipped={equipped}
        effect={effect}
        className="absolute bottom-[7%] left-1/2 h-[69%] w-auto -translate-x-1/2"
      />
      {effect && (
        <div className="pointer-events-none absolute inset-0 flex items-center justify-center gap-36 text-[#db9c8b]">
          <Heart className="float-heart" fill="currentColor" />
          <Sparkles className="float-heart" />
        </div>
      )}
      <span className="absolute bottom-3 left-5 text-[10px] text-[#b09c80]">
        Tempat kecil, banyak cinta.
      </span>
    </div>
  );
}
