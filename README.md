# FindMew 🐾

Aplikasi koleksi foto kucing, peta pertemuan, dan perawatan MyMew. Dibangun dengan React, Vite, Express, dan Supabase. Ilustrasi kucing, ruangan, serta aksesori memakai aset asli Figma.

## Jalankan lokal

Gunakan Node.js 22 dan npm:

```sh
npm ci
npm run dev
```

Buka **http://127.0.0.1:5173**. Konfigurasi Supabase pada instalasi yang sudah berjalan ada di `backend/.env`; pertahankan file tersebut. Salinan baru tanpa konfigurasi memakai demo lokal. Untuk menghubungkan salinan baru ke Supabase, ikuti [panduan pengembangan](docs/development.md).

```sh
npm run check    # sintaks, integritas aset, dan format kode
npm test         # API, transaksi, SQL, dan adapter hosting
npm run build    # frontend production + PWA
npm start        # API + hasil build lokal di port 3001
```

## Struktur

```text
api/                  Entry serverless untuk Vercel
backend/src/          API, validasi, middleware, dan layanan data
backend/test/         Pengujian API dan kontrak Supabase
frontend/src/         Halaman, komponen, state, dan utilitas antarmuka
frontend/public/      Font/ikon/foto contoh dan ilustrasi asli
supabase/migrations/  Riwayat schema database yang berurutan
supabase/test/        Pengujian transaksi dan aturan akses SQL
scripts/              Pemeriksaan aset, PWA, dan ikon
docs/                 Panduan arsitektur, pengembangan, dan deployment
```

Halaman koleksi, kamera, Store, profil, peta, serta dialog kustomisasi dimuat sesuai kebutuhan. API dan foto privat memakai otorisasi akun; data dan transaksi tetap tersimpan di Supabase.

## Aturan poin

| Aktivitas/barang                     | Poin |
| ------------------------------------ | ---: |
| Foto                                 |   10 |
| Foto dan kucing diberi makan — total |   15 |
| Makanan per porsi                    |    3 |
| Topi polos                           |   50 |
| Topi Undip / NY                      |   70 |
| Kacamata                             |   60 |

Mangkuk kosong membuka Store. Makan memakai satu stok; pembelian dan pemakaian aman terhadap pengiriman ulang.

Lihat [arsitektur](docs/architecture.md), [pengembangan](docs/development.md), [deployment Vercel](docs/deployment.md), dan [aset desain](docs/design-assets.md).
