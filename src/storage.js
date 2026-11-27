import * as tus from "tus-js-client";
import { supabase } from "./supabase";

export const BUCKET = "media";
const PLACEHOLDER = ".emptyFolderPlaceholder";
const bucket = () => supabase.storage.from(BUCKET);

export const join = (...p) => p.filter(Boolean).join("/");
export const isVideo = (n) => /\.(mp4|webm|mov|mkv|m4v)$/i.test(n);
export const isImage = (n) => /\.(jpe?g|png|gif|webp|avif|bmp|svg)$/i.test(n);
export const isAudio = (n) => /\.(mp3|wav|ogg|m4a|aac|flac)$/i.test(n);
export const isPdf = (n) => /\.pdf$/i.test(n);
export const extOf = (n) => (n.includes(".") ? n.split(".").pop().slice(0, 5).toUpperCase() : "FILE");
// Jenis file untuk pratinjau: image | video | audio | pdf | other
export const kindOf = (n) =>
  isImage(n) ? "image" : isVideo(n) ? "video" : isAudio(n) ? "audio" : isPdf(n) ? "pdf" : "other";

// Nama aman untuk key storage: tanpa aksen/spasi/simbol aneh
export const clean = (n) =>
  n
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\s+/g, "_")
    .replace(/[^\w.\-]+/g, "_")
    .replace(/^\.+/, "")
    .slice(0, 120);

export const fmtSize = (b) => {
  if (b == null) return "";
  if (b < 1024) return `${b} B`;
  if (b < 1024 ** 2) return `${(b / 1024).toFixed(0)} KB`;
  if (b < 1024 ** 3) return `${(b / 1024 ** 2).toFixed(1)} MB`;
  return `${(b / 1024 ** 3).toFixed(2)} GB`;
};

export function uniqueName(name, taken) {
  if (!taken.has(name)) return name;
  const dot = name.lastIndexOf(".");
  const base = dot > 0 ? name.slice(0, dot) : name;
  const ext = dot > 0 ? name.slice(dot) : "";
  let n = 2;
  while (taken.has(`${base}_${n}${ext}`)) n++;
  return `${base}_${n}${ext}`;
}

export async function rawList(prefix) {
  const { data, error } = await bucket().list(prefix, {
    limit: 1000,
    sortBy: { column: "name", order: "asc" },
  });
  if (error) throw error;
  return data;
}

export async function listDir(prefix) {
  const rows = (await rawList(prefix)).filter((r) => r.name !== PLACEHOLDER);
  return {
    folders: rows.filter((r) => r.id === null).map((r) => r.name),
    files: rows
      .filter((r) => r.id !== null)
      .map((r) => ({ name: r.name, size: r.metadata?.size })),
  };
}

export const fileUrl = (path) => bucket().getPublicUrl(path).data.publicUrl;

export async function downloadFile(path, name) {
  const { data, error } = await bucket().createSignedUrl(path, 300, { download: name });
  if (error) throw error;
  const a = document.createElement("a");
  a.href = data.signedUrl;
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
}

const ZIP_FROM = 5;

export async function downloadMany(paths, zipName) {
  if (paths.length <= ZIP_FROM) {
    for (const p of paths) await downloadFile(p, p.split("/").pop());
    return;
  }
  const { default: JSZip } = await import("jszip");
  const zip = new JSZip();
  for (const p of paths) {
    const { data, error } = await bucket().download(p);
    if (error) throw error;
    zip.file(p.split("/").pop(), data, { compression: "STORE" });
  }
  const url = URL.createObjectURL(await zip.generateAsync({ type: "blob" }));
  const a = document.createElement("a");
  a.href = url;
  a.download = `${zipName}.zip`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 10000);
}

// File di atas ambang ini memakai upload resumable (TUS): dipecah per 6 MB,
// otomatis mengulang potongan yang gagal, dan bisa dilanjutkan kalau terputus.
// Upload biasa sekali kirim sering gagal untuk file besar (timeout / koneksi putus).
const RESUMABLE_FROM = 6 * 1024 * 1024;
const CHUNK = 6 * 1024 * 1024; // Supabase mewajibkan tepat 6 MB

export const cancelError = () => Object.assign(new Error("Dibatalkan"), { name: "UploadCancelled" });

async function accessToken() {
  const { data } = await supabase.auth.getSession(); // otomatis refresh bila hampir habis
  return data.session?.access_token;
}

function uploadResumable(path, file, onProgress, ctl) {
  return new Promise((resolve, reject) => {
    const up = new tus.Upload(file, {
      endpoint: `${import.meta.env.VITE_SUPABASE_URL}/storage/v1/upload/resumable`,
      headers: { apikey: import.meta.env.VITE_SUPABASE_ANON_KEY, "x-upsert": "false" },
      metadata: {
        bucketName: BUCKET,
        objectName: path,
        contentType: file.type || "application/octet-stream",
        cacheControl: "3600",
      },
      chunkSize: CHUNK,
      // POST pembuka dikirim kosong; data baru dikirim lewat PATCH per potongan.
      // Lebih aman untuk proxy/Kong yang memutus koneksi pada POST berbadan besar.
      uploadDataDuringCreation: false,
      removeFingerprintOnSuccess: true,
      retryDelays: [0, 2000, 5000, 10000, 20000, 30000],
      // token selalu dibaca ulang supaya upload panjang (>1 jam) tidak kedaluwarsa
      onBeforeRequest: async (req) => {
        const t = await accessToken();
        if (t) req.setHeader("Authorization", `Bearer ${t}`);
      },
      onProgress: (sent, total) => onProgress?.(Math.round((sent / total) * 100)),
      onError: (err) => {
        const res = err.originalResponse;
        const detail = res ? ` (HTTP ${res.getStatus()}${res.getBody() ? `: ${res.getBody()}` : ""})` : "";
        reject(new Error(`${err.message.split("\n")[0]}${detail}`));
      },
      onSuccess: () => resolve(),
    });
    // Pembatalan: hentikan transfer dan hapus potongan yang sudah terkirim di server
    if (ctl) {
      ctl.abort = () => {
        up.abort(true).catch(() => {}).finally(() => reject(cancelError()));
      };
    }
    // lanjutkan upload sebelumnya untuk file yang sama bila ada
    up.findPreviousUploads().then((prev) => {
      if (ctl?.cancelled) return reject(cancelError());
      if (prev.length) up.resumeFromPreviousUpload(prev[0]);
      up.start();
    });
  });
}

export async function upload(prefix, file, taken, onProgress, ctl) {
  const name = uniqueName(clean(file.name) || "file", taken);
  const path = join(prefix, name);
  if (file.size > RESUMABLE_FROM) {
    await uploadResumable(path, file, onProgress, ctl);
  } else {
    const { error } = await bucket().upload(path, file, {
      contentType: file.type || "application/octet-stream",
    });
    if (error) throw error;
    onProgress?.(100);
  }
  taken.add(name);
}

export async function createFolder(prefix, name) {
  const { error } = await bucket().upload(
    join(prefix, name, PLACEHOLDER),
    new Blob([""], { type: "text/plain" }),
    { contentType: "text/plain" }
  );
  if (error) throw error;
}

async function collectAll(prefix) {
  const out = [];
  for (const r of await rawList(prefix)) {
    if (r.id === null) out.push(...(await collectAll(join(prefix, r.name))));
    else out.push(join(prefix, r.name));
  }
  return out;
}

export async function removePaths(paths) {
  for (let i = 0; i < paths.length; i += 100) {
    const { error } = await bucket().remove(paths.slice(i, i + 100));
    if (error) throw error;
  }
}

export async function removeFolder(prefix) {
  await removePaths(await collectAll(prefix));
}

export async function listUsers(selfId) {
  const { data, error } = await supabase.from("profiles").select("id, username").neq("id", selfId).order("username");
  if (error) throw error;
  return data;
}

export async function transfer(paths, dest, mode) {
  const taken = new Set((await rawList(dest)).map((r) => r.name));
  let ok = 0, fail = 0, same = 0, lastErr = "";
  for (const from of paths) {
    const name = from.split("/").pop();
    if (mode === "move" && from === join(dest, name)) { same++; continue; }
    const newName = uniqueName(name, taken);
    taken.add(newName);
    const to = join(dest, newName);
    // Pindah = salin lalu hapus asal. Hanya butuh policy insert/select/delete,
    // jadi tidak bergantung pada endpoint /object/move yang butuh policy update.
    let { error } = await bucket().copy(from, to);
    if (!error && mode === "move") ({ error } = await bucket().remove([from]));
    if (error) { fail++; lastErr = error.message; } else ok++;
  }
  return { ok, fail, same, lastErr };
}

// Ganti nama = salin ke nama baru lalu hapus yang lama (sama seperti Pindahkan,
// jadi tidak butuh endpoint /object/move).
export async function renameFile(dir, oldName, newName) {
  const from = join(dir, oldName);
  const to = join(dir, newName);
  let { error } = await bucket().copy(from, to);
  if (error) throw error;
  ({ error } = await bucket().remove([from]));
  if (error) throw error;
}

// "Folder" hanyalah awalan nama file, jadi semua isinya disalin ke awalan baru.
// Kalau ada yang gagal, salinan yang sudah terbuat dibersihkan dan folder lama tetap utuh.
export async function renameFolder(dir, oldName, newName) {
  const from = join(dir, oldName);
  const to = join(dir, newName);
  const all = await collectAll(from);
  const done = [];
  for (const p of all) {
    const dest = to + p.slice(from.length);
    const { error } = await bucket().copy(p, dest);
    if (error) {
      await removePaths(done).catch(() => {});
      throw error;
    }
    done.push(dest);
  }
  await removePaths(all);
}
