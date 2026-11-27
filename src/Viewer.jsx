import { useEffect } from "react";
import Icon from "./Icons";

export default function Viewer({ items, index, onIndex, onClose, onDownload }) {
  const item = items[index];
  const prev = () => index > 0 && onIndex(index - 1);
  const next = () => index < items.length - 1 && onIndex(index + 1);

  useEffect(() => {
    const onKey = (e) => {
      if (e.key === "Escape") onClose();
      else if (e.key === "ArrowLeft") prev();
      else if (e.key === "ArrowRight") next();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  if (!item) return null;

  return (
    <div className="viewer" role="dialog" aria-modal="true" aria-label={item.name}
      onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className="viewer-top">
        <span className="viewer-name" title={item.name}>{item.name}</span>
        <span className="muted viewer-count">{index + 1} / {items.length}</span>
        <button onClick={() => onDownload(item.path, item.name)}><Icon name="download" size={16} /> Unduh</button>
        <button className="icon" aria-label="Tutup" onClick={onClose}><Icon name="x" /></button>
      </div>

      <div className="viewer-stage" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
        {item.kind === "video" ? (
          <video key={item.url} className="viewer-media" src={item.url} controls autoPlay />
        ) : item.kind === "image" ? (
          <img key={item.url} className="viewer-media" src={item.url} alt={item.name} />
        ) : item.kind === "audio" ? (
          <audio key={item.url} src={item.url} controls autoPlay />
        ) : item.kind === "pdf" ? (
          <iframe key={item.url} className="viewer-pdf" src={item.url} title={item.name} />
        ) : (
          <div className="viewer-other">
            <Icon name="file" size={56} />
            <p>{item.name}</p>
            <p className="muted">Pratinjau tidak tersedia untuk jenis file ini.</p>
            <button className="primary" onClick={() => onDownload(item.path, item.name)}>
              <Icon name="download" size={16} /> Unduh
            </button>
          </div>
        )}
      </div>

      {index > 0 && (
        <button className="viewer-nav left" aria-label="Sebelumnya" onClick={prev}>‹</button>
      )}
      {index < items.length - 1 && (
        <button className="viewer-nav right" aria-label="Berikutnya" onClick={next}>›</button>
      )}
    </div>
  );
}
