import { createClient } from "@supabase/supabase-js";

const url = import.meta.env.VITE_SUPABASE_URL;
const key = import.meta.env.VITE_SUPABASE_ANON_KEY;

if (!url || !key) {
  console.error("VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY belum diisi di file .env");
}

export const supabase = createClient(url ?? "http://localhost", key ?? "kosong");

// Login memakai username. Supabase Auth mewajibkan email, jadi username diubah
// menjadi email internal: "budi" -> "budi@<LOGIN_DOMAIN>". Kalau yang diketik sudah
// mengandung "@", dipakai apa adanya (akun lama dengan email asli tetap bisa masuk).
const LOGIN_DOMAIN = (import.meta.env.VITE_LOGIN_DOMAIN || "example.com").toLowerCase();

export const toLoginEmail = (input) => {
  const v = input.trim().toLowerCase();
  return v.includes("@") ? v : `${v}@${LOGIN_DOMAIN}`;
};

// Tampilkan hanya username kalau emailnya memakai domain internal
export const displayName = (email = "") => {
  const suffix = `@${LOGIN_DOMAIN}`;
  return email.toLowerCase().endsWith(suffix) ? email.slice(0, -suffix.length) : email;
};
