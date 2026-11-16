# Deployment Vercel

Import repository `kaylrad/FindMew` dari root. `vercel.json` mengatur build `npm run build`, output `frontend/dist`, region Singapore, dan fungsi API Node.js 22. Dependency dipasang melalui `npm ci`.

## Environment server

Isi environment production di Vercel. Untuk preview, gunakan proyek Supabase terpisah agar kode percobaan tidak memakai secret production:

| Nama                       | Nilai/purpose                                                   |
| -------------------------- | --------------------------------------------------------------- |
| `DEMO_MODE`                | `false`                                                         |
| `SUPABASE_URL`             | URL proyek Supabase                                             |
| `SUPABASE_PUBLISHABLE_KEY` | Publishable key proyek                                          |
| `SUPABASE_SECRET_KEY`      | Secret server, simpan sebagai Secret/Sensitive                  |
| `SUPABASE_STORAGE_BUCKET`  | `cat-photos`                                                    |
| `COLLECTION_REWARD`        | `10`                                                            |
| `FEEDING_BONUS_REWARD`     | `5`                                                             |
| `CRON_SECRET`              | Nilai acak minimal 32 karakter, simpan sebagai Secret/Sensitive |

Legacy anon/service-role key juga didukung. Tidak ada secret yang perlu dimasukkan ke repository. Production memakai origin milik project dari metadata `VERCEL_URL` dan `VERCEL_PROJECT_PRODUCTION_URL`; origin tambahan dapat diatur lewat `APP_ORIGINS`. Jangan memakai wildcard origin.

Di Supabase Auth → URL Configuration, masukkan domain production ke Site URL dan daftar redirect. Pertahankan redirect development yang masih dipakai. Langkah ini diperlukan agar tautan konfirmasi akun baru kembali ke aplikasi production. Jika mengganti proyek Supabase, sesuaikan pula origin Supabase pada Content-Security-Policy di `vercel.json`.

## Pemeliharaan dan verifikasi

Vercel Cron memanggil `/api/internal/cleanup` setiap hari pada 00:00 UTC. Endpoint memerlukan bearer `CRON_SECRET`; timer 60 detik tetap dipakai ketika menjalankan server lokal. Durasi fungsi diatur 60 detik. Instance Vercel tidak menyimpan data demo atau file pengguna di disk.

Sesudah deployment siap, periksa halaman masuk, `/api/config`, dan `/api/ready`, lalu uji akun, foto, reward, stok makanan, serta pin/detail peta. CDN menyimpan berkas build berhash lama; HTML, manifest, dan service worker meminta validasi ulang. Semua respons API/foto memakai `no-store`.

Dokumentasi resmi: [Express di Vercel](https://vercel.com/docs/frameworks/backend/express), [batas fungsi](https://vercel.com/docs/functions/limitations), dan [environment variables](https://vercel.com/docs/environment-variables).
