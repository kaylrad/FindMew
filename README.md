# FindMew 🐾

Aplikasi koleksi foto kucing, peta pertemuan, dan perawatan MyMew. Dibangun dengan React, Vite, Express, dan Supabase. Ilustrasi kucing, ruangan, serta aksesori memakai aset asli Figma.

## Jalankan lokal

Gunakan Node.js 22 dan npm:

```sh
npm ci
npm run dev
```

Buka **http://127.0.0.1:5173**. API berjalan di port **3001**. Salinan tanpa konfigurasi memakai demo lokal dengan akun dan foto contoh.

Konfigurasi instalasi yang sudah berjalan ada di `backend/.env`. Untuk salinan baru yang memakai Supabase, salin `backend/.env.example` ke `backend/.env`, lalu isi konfigurasi proyek. Jalankan migration secara berurutan dan `supabase/seed.sql` hanya pada database baru. Secret key digunakan oleh backend.

```sh
npm run check    # sintaks, integritas aset, dan format kode
npm test         # API, transaksi, SQL, dan adapter hosting
npm run build    # frontend production + PWA
npm start        # API + hasil build lokal di port 3001
npm run check:pwa # periksa manifest, ikon, dan service worker setelah build
```

## Struktur

```text
frontend/
  src/
    App.jsx           Navigasi dan kerangka aplikasi
    context.jsx       Sesi, data, cache, dan aksi ke API
    pages/            MyMew, Koleksi, Kamera, Map, Store, dan Profil
    components/
      auth/           Form masuk/daftar dan ilustrasi
      layout/         Header dan identitas aplikasi
      mymew/          Ruangan, kucing, aksesori, dan kustomisasi
      map/            Peta interaktif dan penanda lokasi
      ui.jsx          Tombol, modal, foto, toast, dan status kosong
    lib/              API, cache, katalog aset, dan aturan pose
  public/             Ikon PWA, foto contoh, dan ilustrasi asli
backend/
  src/
    app.js            Konfigurasi Express dan pemasangan route
    routes/           Endpoint akun, koleksi, dan pemeliharaan
    services/         Data demo, Supabase, katalog, dan pengolahan foto
    middleware/       Autentikasi dan penanganan error
  test/               Pengujian API dan integrasi
supabase/
  migrations/         Riwayat perubahan database
  test/               Pengujian transaksi dan aturan akses SQL
api/                  Entry serverless untuk Vercel
scripts/              Pemeriksaan aset, PWA, dan pembuatan ikon
```

Halaman koleksi, kamera, Store, profil, peta, serta dialog kustomisasi dimuat sesuai kebutuhan. API dan foto privat memakai otorisasi akun; data dan transaksi tetap tersimpan di Supabase.

Hasil build `frontend/dist/` (termasuk `sw.js` dan `workbox-*.js`) dibuat otomatis lewat `npm run build`. Folder hasil build, dependency, dan data demo disembunyikan dari Explorer VS Code agar source lebih mudah ditelusuri.

## Alur presentasi

1. Mulai dari `frontend/src/main.jsx` → `App.jsx` → `context.jsx` untuk menjelaskan alur aplikasi.
2. Tunjukkan MyMew: status kucing, memberi makan, serta mengganti kucing, ruangan, dan aksesori.
3. Buka Kamera, ambil foto, isi cerita dan status makan, lalu simpan pertemuan.
4. Tunjukkan Koleksi untuk pencarian, edit cerita, serta pengaturan publik/privat.
5. Buka Map untuk melihat pertemuan yang memiliki lokasi.
6. Buka Store untuk pembelian makanan dan aksesori menggunakan koin.

Alur data: **halaman React → `context.jsx` / `lib/api.js` → route Express → layanan data → Supabase atau demo lokal**. Kamera dan lokasi memerlukan `localhost` atau HTTPS.

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

## Aset desain

Katalog kucing, ruangan, aksesori, dan ikon ada di `frontend/src/lib/mymew-catalog.js`. Komposisi ruangan ada di `mymew-room-layers.js`, sedangkan frame dan aturan pose ada di `cat-poses.js`.

Ilustrasi yang dipakai berada di `frontend/public/mymew/`. `asset-integrity.json` mencatat ukuran dan SHA-256 untuk memastikan aset asli tetap utuh; jalankan `npm run check:assets` untuk memeriksanya. Sumber foto contoh tercatat di [SOURCES.md](frontend/public/photos/SOURCES.md).
