-- Jalankan di Supabase Studio > SQL Editor.
-- Aman dijalankan ulang kalau sebelumnya sudah pernah jalankan versi lama.

-- Bucket tanpa batas ukuran per file dan tanpa batasan tipe file.
-- (null = tidak dibatasi oleh bucket; batas global server tetap berlaku, lihat README)
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('media', 'media', true, null, null)
on conflict (id) do update
  set file_size_limit = null,
      allowed_mime_types = null;

drop policy if exists "login boleh upload" on storage.objects;
drop policy if exists "login boleh lihat" on storage.objects;
drop policy if exists "login boleh hapus" on storage.objects;
drop policy if exists "login boleh ubah" on storage.objects;

create policy "login boleh upload"
on storage.objects for insert to authenticated
with check (bucket_id = 'media');

create policy "login boleh lihat"
on storage.objects for select to authenticated
using (bucket_id = 'media');

create policy "login boleh hapus"
on storage.objects for delete to authenticated
using (bucket_id = 'media');

-- Wajib untuk fitur PINDAHKAN file
create policy "login boleh ubah"
on storage.objects for update to authenticated
using (bucket_id = 'media')
with check (bucket_id = 'media');

-- Realtime: agar daftar file berubah otomatis tanpa refresh.
-- Kalau muncul "must be owner of table objects" (atau "already member of publication"),
-- jalankan sebagai supabase_admin lewat psql, atau abaikan jika sudah aktif.
-- Tanpa ini aplikasi tetap jalan: ada cadangan cek otomatis tiap 10 detik.
alter publication supabase_realtime add table storage.objects;

-- Daftar akun terdaftar untuk fitur KIRIM file
create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  username text not null
);
alter table public.profiles enable row level security;
grant select on public.profiles to authenticated;

drop policy if exists "login boleh lihat profil" on public.profiles;
create policy "login boleh lihat profil"
on public.profiles for select to authenticated
using (true);

create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles (id, username)
  values (new.id, split_part(new.email, '@', 1))
  on conflict (id) do nothing;
  return new;
end $$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
after insert on auth.users
for each row execute function public.handle_new_user();

insert into public.profiles (id, username)
select id, split_part(email, '@', 1) from auth.users
on conflict (id) do nothing;
