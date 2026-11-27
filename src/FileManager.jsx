import { useCallback, useEffect, useRef, useState } from "react";
import { supabase, displayName } from "./supabase";
import * as st from "./storage";
import Modal from "./Modal";
import Icon from "./Icons";
import Viewer from "./Viewer";

function DestPicker({ root, mode, count, currentPath, onCancel, onPick }) {
  const [parts, setParts] = useState([]);
  const [folders, setFolders] = useState([]);
  const dest = st.join(root, ...parts);

  useEffect(() => {
    st.listDir(dest).then((d) => setFolders(d.folders)).catch(() => setFolders([]));
  }, [dest]);

  const verb = mode === "move" ? "Pindahkan" : "Salin";
  const disabled = mode === "move" && dest === currentPath;

  return (
    <Modal
      title={`${verb} ${count} file ke...`}
      onClose={onCancel}
      footer={
        <>
          <button onClick={onCancel}>Batal</button>
          <button className="primary" disabled={disabled} onClick={() => onPick(dest)}>
            {disabled ? "Sudah di folder ini" : `${verb} ke sini`}
          </button>
        </>
      }
    >
      <div className="crumbs small">
        <button className="crumb" onClick={() => setParts([])}>Semua file</button>
        {parts.map((p, i) => (
          <span key={i} className="crumb-wrap">
            <span className="sep">/</span>
            <button className="crumb" onClick={() => setParts(parts.slice(0, i + 1))}>{p}</button>
          </span>
        ))}
      </div>
      <div className="picker">
        {folders.length === 0 && <p className="muted pad">Tidak ada subfolder di sini.</p>}
        {folders.map((f) => (
          <button key={f} className="picker-row" onClick={() => setParts([...parts, f])}>
            <span className="folder-ico"><Icon name="folder" /></span> {f}
          </button>
        ))}
      </div>
    </Modal>
  );
}

function SendDialog({ selfId, count, onCancel, onPick }) {
  const [users, setUsers] = useState(null);
  const [err, setErr] = useState("");

  useEffect(() => {
    st.listUsers(selfId).then(setUsers).catch((e) => setErr(e.message));
  }, [selfId]);

  return (
    <Modal title={`Kirim ${count} file ke...`} onClose={onCancel} footer={<button onClick={onCancel}>Batal</button>}>
      {err && <p className="error">{err}</p>}
      {!err && !users && <p className="muted">Memuat...</p>}
      {users?.length === 0 && <p className="muted">Belum ada akun lain terdaftar.</p>}
      {users?.length > 0 && (
        <div className="picker">
          {users.map((u) => (
            <button key={u.id} className="picker-row" onClick={() => onPick(u)}>{u.username}</button>
          ))}
        </div>
      )}
    </Modal>
  );
}

function NewFolder({ onCancel, onCreate }) {
  const [name, setName] = useState("");
  return (
    <Modal title="Folder baru" onClose={onCancel}>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          onCreate(name);
        }}
      >
        <label>
          Nama folder
          <input autoFocus value={name} onChange={(e) => setName(e.target.value)} placeholder="mis. Kegiatan_Oktober" />
        </label>
        <p className="muted hint">Spasi otomatis diganti garis bawah (_).</p>
        <div className="dialog-foot">
          <button type="button" onClick={onCancel}>Batal</button>
          <button className="primary" disabled={!name.trim()}>Buat folder</button>
        </div>
      </form>
    </Modal>
  );
}

function RenameDialog({ kind, name, taken, onCancel, onSave }) {
  const isFile = kind === "file";
  const dot = isFile ? name.lastIndexOf(".") : -1;
  const ext = dot > 0 ? name.slice(dot) : "";
  const [value, setValue] = useState(dot > 0 ? name.slice(0, dot) : name);
  const [err, setErr] = useState("");

  function submit(e) {
    e.preventDefault();
    const base = st.clean(value.trim());
    if (!base) return setErr("Nama tidak valid.");
    const next = base + ext;
    if (next === name) return onCancel();
    if (taken.includes(next)) return setErr(`"${next}" sudah ada di folder ini.`);
    onSave(next);
  }

  return (
    <Modal title={isFile ? "Ubah nama file" : "Ubah nama folder"} onClose={onCancel}>
      <form onSubmit={submit}>
        <label>
          Nama baru
          <div className="rename-row">
            <input autoFocus value={value} onChange={(e) => { setValue(e.target.value); setErr(""); }}
              onFocus={(e) => e.target.select()} />
            {ext && <span className="muted rename-ext">{ext}</span>}
          </div>
        </label>
        <p className="muted hint">
          Spasi otomatis diganti garis bawah (_).{ext && " Ekstensi file tidak berubah."}
        </p>
        {err && <p className="error">{err}</p>}
        <div className="dialog-foot">
          <button type="button" onClick={onCancel}>Batal</button>
          <button className="primary" disabled={!value.trim()}>Simpan</button>
        </div>
      </form>
    </Modal>
  );
}

export default function FileManager({ user }) {
  const root = user.id;
  const [crumbs, setCrumbs] = useState([]);
  const [data, setData] = useState({ folders: [], files: [] });
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState(() => new Set());
  const [modal, setModal] = useState(null);
  const [toast, setToast] = useState(null);
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState(null);
  const [dragOver, setDragOver] = useState(false);
  const [overFolder, setOverFolder] = useState(null);
  const [viewIdx, setViewIdx] = useState(null);
  const inputRef = useRef(null);
  const uploadCtl = useRef(null); // { cancelled, abort } untuk membatalkan upload
  const here = st.join(root, ...crumbs);

  const go = (next) => {
    history.pushState({ crumbs: next }, "");
    setCrumbs(next);
  };
  useEffect(() => {
    const onPop = (e) => setCrumbs(e.state?.crumbs || []);
    window.addEventListener("popstate", onPop);
    return () => window.removeEventListener("popstate", onPop);
  }, []);

  const notify = (type, text) => setToast({ type, text });
  const download = (path, name) =>
    st.downloadFile(path, name).catch((e) => notify("error", "Gagal mengunduh: " + e.message));
  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), 4500);
    return () => clearTimeout(t);
  }, [toast]);

  const cache = useRef(new Map());
  const hereRef = useRef(here);
  hereRef.current = here;

  const load = useCallback(async () => {
    const target = here;
    const d = await st.listDir(target);
    cache.current.set(target, d);
    if (hereRef.current === target) setData(d);
  }, [here]);

  const refresh = useCallback(async () => {
    const hit = cache.current.get(here);
    setData(hit || { folders: [], files: [] });
    setLoading(!hit);
    try {
      await load();
    } catch (e) {
      setToast({ type: "error", text: e.message });
    }
    setLoading(false);
  }, [here, load]);

  const reload = useCallback(() => load().catch(() => {}), [load]);

  useEffect(() => {
    refresh();
    setSelected(new Set());
  }, [refresh]);

  // Realtime: daftar otomatis berubah saat ada file diunggah/diubah/dihapus
  // (dari tab atau perangkat mana pun) tanpa refresh halaman.
  useEffect(() => {
    let timer;
    const channel = supabase
      .channel(`media-${root}-${here}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "storage", table: "objects", filter: "bucket_id=eq.media" },
        () => {
          // debounce: rename/pindah/upload banyak file memicu banyak event
          clearTimeout(timer);
          timer = setTimeout(reload, 300);
        }
      )
      .subscribe();
    return () => {
      clearTimeout(timer);
      supabase.removeChannel(channel);
    };
  }, [reload, root, here]);

  // Cadangan kalau Realtime belum aktif di server: cek tiap 10 detik saat tab terlihat
  useEffect(() => {
    const id = setInterval(() => {
      if (document.visibilityState === "visible") reload();
    }, 30000);
    return () => clearInterval(id);
  }, [reload]);

  async function run(fn) {
    setBusy(true);
    try { await fn(); } catch (e) { notify("error", e.message || String(e)); }
    setBusy(false);
    refresh();
  }

  function cancelUpload() {
    const ctl = uploadCtl.current;
    if (!ctl || ctl.cancelled) return;
    ctl.cancelled = true;
    ctl.abort?.();
    setProgress((p) => (p ? { ...p, canceling: true } : p));
  }

  async function uploadFiles(list, target = here) {
    const files = [...list].filter((f) => f.size > 0 || f.type); // abaikan entri folder kosong
    if (!files.length) return notify("error", "Tidak ada file untuk diunggah.");
    setProgress({ done: 0, total: files.length, name: "", pct: 0 });
    const ctl = { cancelled: false, abort: null };
    uploadCtl.current = ctl;
    let fail = 0, ok = 0;
    try {
      const taken = new Set((await st.rawList(target)).map((r) => r.name));
      for (const [i, f] of files.entries()) {
        if (ctl.cancelled) break;
        ctl.abort = null;
        setProgress({ done: i, total: files.length, name: f.name, pct: 0 });
        try {
          await st.upload(target, f, taken, (pct) =>
            setProgress((p) => (p ? { ...p, pct } : p)), ctl);
          ok++;
        }
        catch (e) {
          if (e.name === "UploadCancelled") break;
          fail++; notify("error", `${f.name}: ${e.message}`);
        }
        setProgress({ done: i + 1, total: files.length, name: f.name, pct: 100 });
      }
    } catch (e) { fail++; notify("error", e.message); }
    uploadCtl.current = null;
    setProgress(null);
    if (ctl.cancelled) notify("error", ok ? `Dibatalkan. ${ok} file sudah terunggah.` : "Upload dibatalkan.");
    else if (!fail) notify("ok", `${files.length} file terunggah.`);
    if (inputRef.current) inputRef.current.value = "";
    refresh();
  }

  async function createFolder(raw) {
    const name = st.clean(raw.trim());
    if (!name) return notify("error", "Nama folder tidak valid.");
    if (data.folders.includes(name)) return notify("error", `Folder "${name}" sudah ada.`);
    setModal(null);
    await run(async () => {
      await st.createFolder(here, name);
      notify("ok", `Folder "${name}" dibuat.`);
    });
  }

  async function rename(kind, oldName, newName) {
    setModal(null);
    await run(async () => {
      if (kind === "file") await st.renameFile(here, oldName, newName);
      else await st.renameFolder(here, oldName, newName);
      notify("ok", `Diubah menjadi "${newName}".`);
    });
  }

  async function transfer(paths, dest, mode) {
    setModal(null);
    await run(async () => {
      const r = await st.transfer(paths, dest, mode);
      const verb = mode === "move" ? "dipindahkan" : "disalin";
      if (r.fail) notify("error", `${r.fail} file gagal ${mode === "move" ? "dipindahkan" : "disalin"}: ${r.lastErr}`);
      else if (r.ok) notify("ok", `${r.ok} file ${verb}.`);
      else notify("ok", "Tidak ada yang berubah.");
      setSelected(new Set());
    });
  }

  const downloadSelected = () =>
    run(async () => {
      const paths = [...selected];
      notify("ok", paths.length > 5 ? "Menyiapkan ZIP..." : "Mengunduh...");
      await st.downloadMany(paths, crumbs.at(-1) || "media");
    });

  async function send(target) {
    setModal(null);
    await run(async () => {
      const r = await st.transfer([...selected], st.join(target.id, `Dari_${displayName(user.email)}`), "copy");
      if (r.fail) notify("error", `${r.fail} file gagal dikirim: ${r.lastErr}`);
      else notify("ok", `${r.ok} file dikirim ke ${target.username}.`);
      setSelected(new Set());
    });
  }

  function askDeleteSelected() {
    const paths = [...selected];
    setModal({
      type: "confirm",
      title: `Hapus ${paths.length} file?`,
      text: "File yang dihapus tidak bisa dikembalikan.",
      onOk: () => run(async () => {
        await st.removePaths(paths);
        setSelected(new Set());
        notify("ok", `${paths.length} file dihapus.`);
      }),
    });
  }

  function askDeleteFolder(name) {
    setModal({
      type: "confirm",
      title: `Hapus folder "${name}"?`,
      text: "Semua file dan subfolder di dalamnya ikut terhapus. Tidak bisa dikembalikan.",
      onOk: () => run(async () => {
        await st.removeFolder(st.join(here, name));
        notify("ok", `Folder "${name}" dihapus.`);
      }),
    });
  }

  async function copyLink(url) {
    try { await navigator.clipboard.writeText(url); notify("ok", "Link disalin."); }
    catch { notify("error", "Browser menolak menyalin: " + url); }
  }

  const toggle = (path) =>
    setSelected((s) => {
      const n = new Set(s);
      n.has(path) ? n.delete(path) : n.add(path);
      return n;
    });

  const hasFiles = (e) => [...(e.dataTransfer?.types || [])].includes("Files");
  const filePaths = data.files.map((f) => st.join(here, f.name));
  const viewItems = data.files.map((f) => {
    const path = st.join(here, f.name);
    return { name: f.name, url: st.fileUrl(path), path, kind: st.kindOf(f.name) };
  });
  const empty = !loading && !data.folders.length && !data.files.length;

  return (
    <div className="app">
      <header className="bar">
        <strong className="brand">Media</strong>
        <span className="muted who">{displayName(user.email)}</span>
        <button className="ghost" onClick={() => supabase.auth.signOut()}>Keluar</button>
      </header>

      <main
        className={`main${dragOver ? " drag" : ""}`}
        onDragOver={(e) => { if (hasFiles(e)) { e.preventDefault(); setDragOver(true); } }}
        onDragLeave={(e) => { if (!e.currentTarget.contains(e.relatedTarget)) setDragOver(false); }}
        onDrop={(e) => {
          setDragOver(false);
          if (hasFiles(e)) { e.preventDefault(); uploadFiles(e.dataTransfer.files); }
        }}
      >
        <div className="toolbar">
          <nav className="crumbs" aria-label="Lokasi folder">
            <button className="crumb" onClick={() => go([])}>Semua file</button>
            {crumbs.map((c, i) => (
              <span key={i} className="crumb-wrap">
                <span className="sep">/</span>
                <button className="crumb" onClick={() => go(crumbs.slice(0, i + 1))}>{c}</button>
              </span>
            ))}
          </nav>
          <div className="tools">
            <button onClick={() => setModal({ type: "newfolder" })} disabled={busy}>
              <Icon name="plus" /> Folder baru
            </button>
            <button className="primary" onClick={() => inputRef.current?.click()} disabled={!!progress}>
              <Icon name="upload" /> Unggah
            </button>
            <input ref={inputRef} type="file" multiple hidden
              onChange={(e) => e.target.files.length && uploadFiles(e.target.files)} />
          </div>
        </div>

        {progress && (
          <div className="progress-wrap">
            <div className="progress-row">
              <span className="muted">{progress.canceling ? "Membatalkan..." : `Mengunggah ${Math.min(progress.done + 1, progress.total)} dari ${progress.total}${progress.name ? ` — ${progress.name}` : ""} (${progress.pct ?? 0}%)`}</span>
              <button className="icon" aria-label="Batalkan upload" title="Batalkan upload"
                onClick={cancelUpload} disabled={progress.canceling}>
                <Icon name="x" size={16} />
              </button>
            </div>
            <div className="progress"><div style={{ width: `${((progress.done + (progress.pct ?? 0) / 100) / progress.total) * 100}%` }} /></div>
          </div>
        )}

        {selected.size > 0 && (
          <div className="selbar" role="region" aria-label="Aksi file terpilih">
            <strong>{selected.size} dipilih</strong>
            <button className="link" onClick={() => setSelected(new Set(filePaths))}>Pilih semua</button>
            <span className="grow" />
            <button onClick={downloadSelected} disabled={busy}><Icon name="download" /> {selected.size > 5 ? "Unduh ZIP" : "Unduh"}</button>
            <button onClick={() => setModal({ type: "send" })} disabled={busy}><Icon name="send" /> Kirim</button>
            <button onClick={() => setModal({ type: "dest", mode: "move" })} disabled={busy}><Icon name="move" /> Pindahkan</button>
            <button onClick={() => setModal({ type: "dest", mode: "copy" })} disabled={busy}><Icon name="copy" /> Salin</button>
            <button className="danger" onClick={askDeleteSelected} disabled={busy}><Icon name="trash" /> Hapus</button>
            <button className="icon" aria-label="Batal pilih" onClick={() => setSelected(new Set())}><Icon name="x" /></button>
          </div>
        )}

        {loading && <p className="muted pad">Memuat...</p>}

        {data.folders.length > 0 && (
          <div className="folders">
            {data.folders.map((f) => (
              <div
                key={f}
                className={`folder${overFolder === f ? " over" : ""}`}
                onDragOver={(e) => { e.preventDefault(); e.stopPropagation(); setOverFolder(f); }}
                onDragLeave={() => setOverFolder(null)}
                onDrop={(e) => {
                  e.preventDefault(); e.stopPropagation();
                  setOverFolder(null); setDragOver(false);
                  const raw = e.dataTransfer.getData("application/x-media");
                  if (raw) transfer(JSON.parse(raw), st.join(here, f), "move");
                  else if (hasFiles(e)) uploadFiles(e.dataTransfer.files, st.join(here, f));
                }}
              >
                <button className="folder-open" onClick={() => go([...crumbs, f])}>
                  <span className="folder-ico"><Icon name="folder" size={22} /></span>
                  <span className="folder-name" title={f}>{f}</span>
                </button>
                <button className="icon" aria-label={`Ubah nama folder ${f}`} title="Ubah nama" disabled={busy}
                  onClick={() => setModal({ type: "rename", kind: "folder", name: f })}>
                  <Icon name="edit" size={16} />
                </button>
                <button className="icon danger" aria-label={`Hapus folder ${f}`} onClick={() => askDeleteFolder(f)}>
                  <Icon name="trash" size={16} />
                </button>
              </div>
            ))}
          </div>
        )}

        {data.files.length > 0 && (
          <div className="files">
            {data.files.map((f, idx) => {
              const path = st.join(here, f.name);
              const isSel = selected.has(path);
              const url = st.fileUrl(path);
              return (
                <div
                  key={path}
                  className={`file${isSel ? " sel" : ""}`}
                  draggable
                  onDragStart={(e) => {
                    const paths = isSel ? [...selected] : [path];
                    e.dataTransfer.setData("application/x-media", JSON.stringify(paths));
                    e.dataTransfer.effectAllowed = "move";
                  }}
                >
                  <div
                    className="thumb-wrap"
                    role="button"
                    tabIndex={0}
                    aria-label={`Buka ${f.name}`}
                    onClick={() => setViewIdx(idx)}
                    onKeyDown={(e) => e.key === "Enter" && setViewIdx(idx)}
                  >
                    {st.kindOf(f.name) === "video" ? (
                      <video className="thumb" src={url} preload="metadata" muted />
                    ) : st.kindOf(f.name) === "image" ? (
                      <img className="thumb" src={url} alt={f.name} loading="lazy" decoding="async" />
                    ) : (
                      <div className="thumb generic">
                        <Icon name="file" size={40} />
                        <span className="ext">{st.extOf(f.name)}</span>
                      </div>
                    )}
                    {st.kindOf(f.name) === "video" && <span className="badge"><Icon name="play" size={12} /> Video</span>}
                    <input
                      type="checkbox"
                      className="check"
                      checked={isSel}
                      onClick={(e) => e.stopPropagation()}
                      onChange={() => toggle(path)}
                      aria-label={`Pilih ${f.name}`}
                    />
                  </div>
                  <div className="meta">
                    <span className="name" title={f.name}>{f.name}</span>
                    <span className="muted size">{st.fmtSize(f.size)}</span>
                    <div className="actions">
                      <button className="icon" aria-label={`Unduh ${f.name}`} title="Unduh" onClick={() => download(path, f.name)}>
                        <Icon name="download" size={16} />
                      </button>
                      <button className="icon" aria-label="Salin link" title="Salin link" onClick={() => copyLink(url)}>
                        <Icon name="link" size={16} />
                      </button>
                      <button className="icon" aria-label={`Ubah nama ${f.name}`} title="Ubah nama" disabled={busy}
                        onClick={() => setModal({ type: "rename", kind: "file", name: f.name })}>
                        <Icon name="edit" size={16} />
                      </button>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {empty && (
          <div className="empty">
            <p><strong>Folder ini kosong.</strong></p>
            <p className="muted">Seret file apa saja ke sini, atau klik Unggah. Kamu juga bisa membuat folder baru.</p>
          </div>
        )}

        {dragOver && <div className="dropnote">Lepas untuk mengunggah ke {crumbs.at(-1) || "Semua file"}</div>}
      </main>

      {viewIdx !== null && (
        <Viewer items={viewItems} index={viewIdx} onDownload={download} onIndex={setViewIdx} onClose={() => setViewIdx(null)} />
      )}

      {toast && <div className={`toast ${toast.type}`} role="status">{toast.text}</div>}

      {modal?.type === "newfolder" && <NewFolder onCancel={() => setModal(null)} onCreate={createFolder} />}
      {modal?.type === "rename" && (
        <RenameDialog
          kind={modal.kind}
          name={modal.name}
          taken={modal.kind === "file" ? data.files.map((f) => f.name) : data.folders}
          onCancel={() => setModal(null)}
          onSave={(next) => rename(modal.kind, modal.name, next)}
        />
      )}
      {modal?.type === "send" && (
        <SendDialog selfId={user.id} count={selected.size} onCancel={() => setModal(null)} onPick={send} />
      )}
      {modal?.type === "dest" && (
        <DestPicker
          root={root}
          mode={modal.mode}
          count={selected.size}
          currentPath={here}
          onCancel={() => setModal(null)}
          onPick={(dest) => transfer([...selected], dest, modal.mode)}
        />
      )}
      {modal?.type === "confirm" && (
        <Modal
          title={modal.title}
          onClose={() => setModal(null)}
          footer={
            <>
              <button onClick={() => setModal(null)}>Batal</button>
              <button className="primary danger-fill" onClick={() => { const ok = modal.onOk; setModal(null); ok(); }}>Hapus</button>
            </>
          }
        >
          <p className="muted">{modal.text}</p>
        </Modal>
      )}
    </div>
  );
}
