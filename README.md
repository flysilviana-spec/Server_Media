# Upload Media (React + Supabase)

Halaman depan login, setelah login bisa upload file apa saja (foto, video, dokumen, arsip, dll.) ke Supabase Storage.

## Persiapan Supabase (sekali saja)
1. Studio -> Authentication -> Users -> Add user -> Create new user.
   Email `admin@example.com`, password `admin123`, centang **Auto Confirm User**.
   Login memakai **username**: yang diketik hanya bagian sebelum `@` (`admin`), domainnya otomatis `@example.com`
   (ubah lewat `VITE_LOGIN_DOMAIN` di `.env`). Untuk user baru, buat dengan email `namauser@example.com` lalu login cukup dengan `namauser`.
   Mengetik email lengkap (ada `@`) tetap bisa dipakai.
   (Password minimal 6 karakter, jadi `admin` saja akan ditolak. Ganti sebelum dipakai serius.)
2. Studio -> SQL Editor -> jalankan isi file `setup.sql` (aman diulang; ada policy UPDATE baru yang wajib untuk fitur Pindahkan).

## Menjalankan
```bash
cp .env.example .env     # lalu isi VITE_SUPABASE_ANON_KEY
npm install
npm run dev
```
Buka alamat yang muncul (biasanya http://localhost:5173).

## Catatan
- Pakai ANON_KEY, jangan pernah SERVICE_ROLE_KEY di frontend.
- Aplikasi dan bucket tidak membatasi ukuran maupun jenis file. Batas yang tersisa ada di server:
  - Supabase self-hosted: naikkan `FILE_SIZE_LIMIT` (byte) di `.env` Supabase (service storage), lalu restart storage. Contoh 10 GB: `FILE_SIZE_LIMIT=10737418240`.
  - Jika ada reverse proxy (nginx dll.), naikkan juga batas body-nya (nginx: `client_max_body_size`).
  - Supabase Cloud: atur di Dashboard > Storage > Settings (batas tergantung paket).
  - File sangat besar (di atas beberapa GB) sebaiknya memakai upload resumable (TUS).

## Fitur
- Folder baru, masuk/keluar folder lewat breadcrumb
- Unggah banyak file apa saja (klik atau seret ke halaman, atau seret ke kartu folder)
- Pilih file (centang) lalu Pindahkan / Salin / Hapus; atau seret file ke folder untuk memindahkan
- Unduh dan salin link per file
- Ubah nama file dan folder (ikon pensil). Ekstensi file tidak berubah; nama yang sudah dipakai ditolak. Mengubah nama folder menyalin semua isinya ke nama baru, jadi folder besar bisa butuh beberapa saat.
- Catatan: "folder" di Supabase Storage hanya awalan nama file. Folder kosong disimpan dengan file `.emptyFolderPlaceholder`.
- **Realtime**: daftar file otomatis ikut berubah saat ada upload/rename/pindah/hapus tanpa refresh halaman (Supabase Realtime pada `storage.objects`). Perlu menjalankan baris `alter publication ...` di akhir `setup.sql`; self-hosted: pastikan container `realtime` berjalan. Kalau Realtime belum aktif, ada cadangan polling tiap 10 detik.
- **File besar**: file di atas 6 MB diunggah dengan upload resumable (TUS, library `tus-js-client`): dipecah per 6 MB, potongan yang gagal diulang otomatis, dan bisa dilanjutkan bila koneksi putus. Setelah memperbarui project jalankan `npm install`. Endpoint yang dipakai: `<SUPABASE_URL>/storage/v1/upload/resumable`; pastikan ikut diteruskan oleh Kong/reverse proxy (nginx: matikan `proxy_request_buffering` dan naikkan `client_max_body_size` serta `proxy_read_timeout`/`proxy_send_timeout`).
