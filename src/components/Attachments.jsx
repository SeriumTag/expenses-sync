import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { confirmTwice } from '../lib/confirm';
import { setPath } from '../lib/db';
import { attachFile, dataUrlToBlob, fileIcon, fileList, fileSizeLabel, loadFile } from '../lib/files';

const ACCEPT = 'image/*,application/pdf,.pdf,.doc,.docx,.xls,.xlsx,.csv,.txt,.ppt,.pptx';

// Photos and documents attached to an item: receipts, policies, statements…
// itemPath is relative to the ledger, e.g. periods/2026-10/items/{tab}/{item}.
export default function Attachments({ ledgerId, itemPath, files, username }) {
  const list = fileList(files);
  const [uploading, setUploading] = useState([]); // names being uploaded
  const [error, setError] = useState('');
  const [open, setOpen] = useState(null); // file being viewed
  const input = useRef(null);

  async function pick(e) {
    const chosen = [...(e.target.files || [])];
    e.target.value = ''; // so the same file can be picked again
    if (!chosen.length) return;
    setError('');
    setUploading((u) => [...u, ...chosen.map((f) => f.name)]);
    const problems = [];
    for (const file of chosen) {
      try {
        await attachFile(ledgerId, itemPath, file, username);
      } catch (err) {
        problems.push(err.message || `Couldn’t attach “${file.name}”.`);
      } finally {
        setUploading((u) => {
          const i = u.indexOf(file.name);
          return i < 0 ? u : [...u.slice(0, i), ...u.slice(i + 1)];
        });
      }
    }
    if (problems.length) setError(problems.join(' '));
  }

  function remove(f) {
    if (!confirmTwice(`Remove “${f.name}” from this item?`, `“${f.name}”`)) return;
    setOpen(null);
    setPath(`ledgers/${ledgerId}/${itemPath}/files/${f.id}`, null);
  }

  return (
    <section className="sheet-section attachments">
      <div className="sheet-row between">
        <h3>
          Attachments{list.length > 0 && <span className="muted small"> · {list.length}</span>}
        </h3>
        <button className="btn glass sm" onClick={() => input.current?.click()}>
          📎 Attach
        </button>
        <input ref={input} type="file" accept={ACCEPT} multiple hidden onChange={pick} />
      </div>
      {list.length === 0 && !uploading.length && <p className="muted small">Add photos or documents, e.g. a receipt, policy or bill.</p>}
      {(list.length > 0 || uploading.length > 0) && (
        <div className="att-grid">
          {list.map((f) => (
            <AttachmentTile key={f.id} file={f} onOpen={() => setOpen(f)} />
          ))}
          {uploading.map((name, i) => (
            <div key={`up-${i}`} className="att-tile uploading" title={name}>
              <span className="att-spinner" aria-hidden="true" />
              <span className="att-name">Uploading…</span>
            </div>
          ))}
        </div>
      )}
      {error && <p className="att-error">{error}</p>}
      {open && <AttachmentViewer file={open} onRemove={() => remove(open)} onClose={() => setOpen(null)} />}
    </section>
  );
}

function useFileData(file) {
  const [state, setState] = useState({ data: null, error: '' });
  useEffect(() => {
    let alive = true;
    loadFile(file.id, file)
      .then((data) => alive && setState({ data, error: '' }))
      .catch((err) => alive && setState({ data: null, error: err.message }));
    return () => {
      alive = false;
    };
  }, [file.id]); // eslint-disable-line react-hooks/exhaustive-deps
  return state;
}

function AttachmentTile({ file, onOpen }) {
  const isImage = file.type?.startsWith('image/');
  return (
    <button className={`att-tile ${isImage ? 'image' : ''}`} onClick={onOpen} title={file.name}>
      {isImage ? <Thumb file={file} /> : <span className="att-icon">{fileIcon(file.type, file.name)}</span>}
      <span className="att-name">{file.name}</span>
      <span className="att-size">{fileSizeLabel(file.size)}</span>
    </button>
  );
}

function Thumb({ file }) {
  const { data, error } = useFileData(file);
  if (error) return <span className="att-icon">⚠️</span>;
  return data ? <img className="att-thumb" src={data} alt="" /> : <span className="att-thumb loading" />;
}

// Full view of one attachment, with Open / Save / Remove.
function AttachmentViewer({ file, onRemove, onClose }) {
  const { data, error } = useFileData(file);
  const [url, setUrl] = useState(null);
  const isImage = file.type?.startsWith('image/');

  useEffect(() => {
    if (!data) return undefined;
    const u = URL.createObjectURL(dataUrlToBlob(data));
    setUrl(u);
    return () => URL.revokeObjectURL(u);
  }, [data]);

  useEffect(() => {
    // Escape closes just the viewer, not the item card underneath.
    const onKey = (e) => {
      if (e.key !== 'Escape') return;
      e.stopImmediatePropagation();
      onClose();
    };
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
  }, [onClose]);

  // Rendered on <body>: the sheet's slide-up transform would otherwise trap it.
  return createPortal(
    <div className="lightbox" role="dialog" aria-modal="true" aria-label={file.name} onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className="lightbox-card">
        <div className="lightbox-head">
          <b title={file.name}>{file.name}</b>
          <button className="icon-btn" onClick={onClose} aria-label="Close">
            ✕
          </button>
        </div>
        <div className="lightbox-body">
          {error ? (
            <p className="att-error">{error}</p>
          ) : !data ? (
            <p className="muted">Loading…</p>
          ) : isImage ? (
            <img src={data} alt={file.name} />
          ) : (
            <div className="lightbox-doc">
              <span className="att-icon big">{fileIcon(file.type, file.name)}</span>
              <span className="muted small">
                {fileSizeLabel(file.size)}
                {file.by ? ` · added by ${file.by}` : ''}
              </span>
            </div>
          )}
        </div>
        <div className="lightbox-actions">
          <button className="btn danger sm" onClick={onRemove}>
            Remove
          </button>
          <span className="row-gap">
            {url && (
              <a className="btn glass sm" href={url} download={file.name}>
                Save
              </a>
            )}
            {url && (
              <a className="btn primary sm" href={url} target="_blank" rel="noopener noreferrer">
                Open
              </a>
            )}
          </span>
        </div>
      </div>
    </div>,
    document.body,
  );
}
