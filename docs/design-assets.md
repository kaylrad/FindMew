# Aset desain

Ilustrasi pada `frontend/public/mymew` berasal dari Figma pengguna. Berkas SVG dan PNG disimpan dalam bentuk asli; wrapper aplikasi hanya mengatur posisi, crop, serta skala yang seragam. Nama ekspor dan ID layer dipertahankan untuk penelusuran ke desain.

`frontend/public/mymew/asset-integrity.json` mencatat nama, ukuran, dan SHA-256 aset yang dipakai. Jalankan `npm run check:assets` untuk memeriksa bahwa bentuk asli tidak berubah dan referensi aset tetap valid.

`frontend/src/lib/mymew-catalog.js` berisi tipe kucing, ruangan, aksesori, dan ikon UI. `mymew-room-layers.js` berisi penempatan layer ruangan. `cat-poses.js` berisi frame sprite dan aturan pose. `MewScene.jsx` menampilkan komposisi responsif dan pratinjau kustomisasi.

Foto contoh memiliki sumber pada `frontend/public/photos/SOURCES.md`. Ikon PWA dibuat melalui `npm run icons`.

Laporan pengujian dan screenshot lama tidak termasuk source release. Aset lama yang tidak memiliki referensi kode telah dipisahkan sebagai arsip saat perapihan, dengan verifikasi hash sebelum dipindahkan.
