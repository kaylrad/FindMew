# Arsitektur

Proyek memakai npm workspaces dengan frontend React/Vite dan backend Express. Local development menjalankan API di port 3001 dan Vite di 5173. Vite meneruskan `/api` ke backend. Hasil production frontend tersedia di `frontend/dist`.

Di Vercel, frontend disajikan CDN dan `/api/*` diteruskan ke `api/index.js`. Adapter menyimpan satu proses inisialisasi aplikasi per instance hangat, tanpa membuka port atau membuat timer latar. Konfigurasi dan validasi tetap berada di backend.

## Data dan identitas

Supabase Auth mengelola akun. Frontend hanya menerima URL dan publishable key melalui `/api/config`, lalu mengirim access token ke API. Backend memverifikasi token dengan Supabase sebelum membaca atau mengubah data. Secret key tetap di server.

Metadata koleksi, inventaris, status MyMew, serta ledger poin berada di Postgres. Foto berada di bucket Storage privat. Endpoint foto memeriksa pemilik atau izin publik sebelum mengirim gambar. Peta akun menggabungkan foto berlokasi milik sendiri dan foto publik pengguna lain; foto privat tidak dibagikan kepada pengguna lain.

## Transaksi

Upload, pembelian, pemakaian makanan, dan bermain memakai UUID `Idempotency-Key`. RPC database mengunci profil dan mencatat receipt, sehingga retry tidak menggandakan hadiah atau menghabiskan barang dua kali. Operasi database dan Storage memakai upload jobs serta deletion jobs yang dapat dilanjutkan setelah kegagalan.

Makan memerlukan satu stok, menambah Energy hingga 100, dan memakai jeda 30 detik. Jalur makan dari mangkuk maupun inventaris memakai transaksi yang sama. Koleksi lama, saldo, kepemilikan, dan riwayat pembelian dipertahankan.

## Antarmuka

`App.jsx` mengatur navigasi hash dan memuat halaman sesuai kebutuhan. `components/layout` berisi header, `components/auth` berisi layar masuk, `pages` berisi alur utama, dan `lib` berisi API/cache/katalog/pose. Metadata penempatan ruangan terpisah dari katalog produk.

IndexedDB menyimpan snapshot dan foto per akun untuk tampilan offline. Logout membersihkan data privat lokal. Service worker hanya menyimpan app shell dan aset statis; respons API, token, serta Auth tidak masuk cache CDN atau service worker.
