# Pengembangan

## Persiapan

Gunakan Node.js 22. Jalankan `npm ci` di root. Salinan tanpa environment menjalankan demo lokal dan menyimpan data contoh di `backend/.data/` yang diabaikan Git. Data demo terpisah dari Supabase.

Untuk instalasi baru yang memakai Supabase, salin `backend/.env.example` ke `backend/.env`, set `DEMO_MODE=false`, lalu isi URL proyek, publishable key, dan secret key. Jangan menimpa `.env` pada instalasi yang sudah dikonfigurasi. Jangan meletakkan secret key di `VITE_*` atau frontend.

Jalankan seluruh migration `supabase/migrations/*.sql` sesuai urutan hanya pada database baru. Database FindMew yang sudah terhubung memakai schema 5 dan enam migration; jangan menerapkan ulang migration yang sudah tercatat. `supabase/seed.sql` menyiapkan katalog untuk instalasi baru.

## Perintah

- `npm run dev`: API + frontend dengan pembaruan otomatis.
- `npm run check`: sintaks backend, hash aset, dan format kode.
- `npm test`: tes API/SQL/adapter serverless, memakai fixture sementara.
- `npm run build`: build frontend dan service worker.
- `npm run format`: rapikan sumber yang didukung Prettier; ilustrasi asli dikecualikan.
- `npm run cleanup -w backend`: bersihkan upload terabaikan dan foto yang penghapusannya tertunda.

Kamera dan geolokasi memerlukan `localhost` atau HTTPS. Foto sumber dikompresi di browser menjadi JPEG maksimal 1600px; API menerima satu foto hingga 4 MB dan mengubahnya menjadi WebP tanpa metadata. Batas 4 MB menjaga multipart di bawah batas request Vercel 4,5 MB.

## Konfigurasi penting

`COLLECTION_REWARD=10` dan `FEEDING_BONUS_REWARD=5` memberi 10/15 poin. `APP_ORIGINS` berisi origin frontend yang diizinkan. `TRUST_PROXY_HOPS` hanya diubah bila berada di belakang proxy yang diketahui. `CRON_SECRET` minimal 32 karakter melindungi pemeliharaan terjadwal.

Verifikasi integrasi melalui `/api/ready`: mode `supabase`, database dan Storage siap, serta `schemaVersion: 5`. Tes lokal menggunakan demo dan Postgres sementara; pengujian akun/Supabase langsung harus memakai fixture yang terisolasi dan dibersihkan.
