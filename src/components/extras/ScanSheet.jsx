import { useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { fixValue, guessFromOcr } from '../../lib/weight';
import Modal from '../Modal';

// On-device text reading, loaded only when someone scans (first time ~10 MB, then cached).
const TESSERACT_URL = 'https://cdn.jsdelivr.net/npm/tesseract.js@5.1.1/dist/tesseract.min.js';
let pageWorker = null; // reads whole photos
let digitWorker = null; // reads a cropped number (digits only)

function loadTesseract() {
  if (window.Tesseract) return Promise.resolve();
  return new Promise((resolve, reject) => {
    const s = document.createElement('script');
    s.src = TESSERACT_URL;
    s.onload = () => resolve();
    s.onerror = () => reject(new Error('Couldn’t load the reading engine — check your connection and try again.'));
    document.head.appendChild(s);
  });
}

const loadImage = (src) =>
  new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = reject;
    img.src = src;
  });

// Black-and-white against the photo's own average brightness, so glare and
// room light don't wash the digits out.
function threshold(ctx, w, h, factor) {
  const data = ctx.getImageData(0, 0, w, h);
  const d = data.data;
  let sum = 0;
  for (let i = 0; i < d.length; i += 4) sum += 0.3 * d[i] + 0.59 * d[i + 1] + 0.11 * d[i + 2];
  const th = (sum / (d.length / 4)) * factor;
  for (let i = 0; i < d.length; i += 4) {
    const v = 0.3 * d[i] + 0.59 * d[i + 1] + 0.11 * d[i + 2] < th ? 0 : 255;
    d[i] = d[i + 1] = d[i + 2] = v;
  }
  ctx.putImageData(data, 0, 0);
}

async function prepare(file) {
  const thumb = await new Promise((resolve) => {
    const r = new FileReader();
    r.onload = (e) => resolve(e.target.result);
    r.readAsDataURL(file);
  });
  const img = await loadImage(thumb);
  const scale = Math.min(1200 / img.width, 2);
  const c = document.createElement('canvas');
  c.width = Math.round(img.width * scale);
  c.height = Math.round(img.height * scale);
  const ctx = c.getContext('2d');
  ctx.drawImage(img, 0, 0, c.width, c.height);
  threshold(ctx, c.width, c.height, 0.82);
  return { thumb, dataUrl: c.toDataURL('image/png') };
}

// Just the boxed area, blown up big (OCR does far better on chunky digits).
async function cropToDataUrl(src, sel) {
  const img = await loadImage(src);
  const sx = Math.round(sel.x * img.width);
  const sy = Math.round(sel.y * img.height);
  const sw = Math.max(8, Math.round(sel.w * img.width));
  const sh = Math.max(8, Math.round(sel.h * img.height));
  const scale = Math.max(3, Math.min(700 / sw, 8));
  const c = document.createElement('canvas');
  c.width = Math.round(sw * scale) + 40;
  c.height = Math.round(sh * scale) + 40;
  const ctx = c.getContext('2d');
  ctx.fillStyle = '#fff';
  ctx.fillRect(0, 0, c.width, c.height);
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(img, sx, sy, sw, sh, 20, 20, c.width - 40, c.height - 40);
  threshold(ctx, c.width, c.height, 0.85);
  return c.toDataURL('image/png');
}

const OPTIONS = [
  ['weight', 'Weight'],
  ['bmi', 'BMI'],
  ['bodyAge', 'Body age'],
  ['fat', 'Body fat'],
  ['muscle', 'Muscle'],
  ['visceral', 'Visceral fat'],
];

// Pick photos of the scale; each is read and its stat guessed. Check each
// against its thumbnail (tap one to box the number and re-read), then add
// them as one reading.
export default function ScanSheet({ onSave, onClose }) {
  const [rows, setRows] = useState([]); // { thumb, metric, value, include }
  const [date, setDate] = useState(() => new Date().toLocaleDateString('en-CA'));
  const [progress, setProgress] = useState('');
  const [status, setStatus] = useState('');
  const [cropAt, setCropAt] = useState(null);
  const inputRef = useRef(null);
  const setRow = (i, patch) => setRows((rs) => rs.map((r, j) => (j === i ? { ...r, ...patch } : r)));

  async function pick(e) {
    const files = Array.from(e.target.files || []);
    e.target.value = '';
    if (!files.length) return;
    setRows([]);
    setStatus('');
    try {
      setProgress('Loading the reading engine (first time only)…');
      await loadTesseract();
      pageWorker ||= await window.Tesseract.createWorker('eng');
      const found = [];
      for (let i = 0; i < files.length; i++) {
        setProgress(`Reading photo ${i + 1} of ${files.length}…`);
        const { thumb, dataUrl } = await prepare(files[i]);
        const { data } = await pageWorker.recognize(dataUrl);
        const g = guessFromOcr(data.words);
        found.push({ thumb, metric: g.metric, value: g.value, include: g.metric != null && g.value != null });
        setRows([...found]);
      }
      setProgress('');
      const unread = found.filter((r) => r.value == null || !r.metric).length;
      setStatus(
        unread === found.length
          ? 'Couldn’t read those automatically. Tap a thumbnail to box just the number, or type each value in.'
          : 'Check every value against its photo. Tap a thumbnail to re-read it, or type over anything wrong.',
      );
    } catch (err) {
      setProgress('');
      setStatus(err.message || 'Something went wrong reading those photos.');
    }
  }

  async function save() {
    const reading = { date: /^\d{4}-\d{2}-\d{2}$/.test(date) ? date : new Date().toLocaleDateString('en-CA'), weight: null, bmi: null, bodyAge: null, fat: null, muscle: null, visceral: null };
    const seen = new Set();
    for (const r of rows) {
      if (!r.include || r.value == null || !r.metric) continue;
      if (seen.has(r.metric)) return setStatus('Two photos are set to the same stat — fix that first so nothing gets overwritten.');
      seen.add(r.metric);
      reading[r.metric] = r.value;
    }
    if (!seen.size) return setStatus('Nothing ticked — tick at least one photo and pick its stat.');
    await onSave(reading);
    onClose();
  }

  return (
    <Modal title="Scan photos" onClose={onClose}>
      <div className="sheet scan-sheet">
        <p className="muted small">Pick your scale photos — as many as you like. It guesses which stat each one shows, but LCD digits are hard to read, so check each one.</p>
        <input ref={inputRef} type="file" accept="image/*" multiple hidden onChange={pick} />
        <button className="scan-drop" onClick={() => inputRef.current?.click()}>
          <span className="sd-ico">📷</span>
          <b>Choose photos</b>
          <span className="muted small">Camera or photo library, several at once is fine</span>
        </button>
        {progress && <p className="scan-progress">{progress}</p>}

        {rows.length > 0 && (
          <>
            <label className="field">
              <span>Reading date</span>
              <input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
            </label>
            <div className="scan-rows">
              {rows.map((r, i) => (
                <div key={i} className="scan-row">
                  <input type="checkbox" checked={r.include} onChange={(e) => setRow(i, { include: e.target.checked })} aria-label="Include this photo" />
                  <button className="scan-thumb" onClick={() => setCropAt(i)} title="Tap to box the number and read it">
                    <img src={r.thumb} alt={`Photo ${i + 1}`} />
                  </button>
                  <select value={r.metric || ''} onChange={(e) => setRow(i, { metric: e.target.value || null })} aria-label="Which stat">
                    <option value="">Pick one…</option>
                    {OPTIONS.map(([k, l]) => (
                      <option key={k} value={k}>
                        {l}
                      </option>
                    ))}
                  </select>
                  <input
                    inputMode="decimal"
                    value={r.value ?? ''}
                    onChange={(e) => {
                      const v = parseFloat(e.target.value);
                      setRow(i, { value: Number.isNaN(v) ? null : v });
                    }}
                    aria-label="Value"
                  />
                </div>
              ))}
            </div>
          </>
        )}
        {status && <p className="muted small">{status}</p>}
        <div className="row-gap end">
          <button className="btn ghost" onClick={onClose}>
            Cancel
          </button>
          {rows.length > 0 && (
            <button className="btn primary" onClick={save}>
              Add to log
            </button>
          )}
        </div>
      </div>
      {cropAt != null && (
        <CropReader
          src={rows[cropAt].thumb}
          onRead={(raw) => {
            setRow(cropAt, { value: fixValue(rows[cropAt].metric, raw), include: true });
            setCropAt(null);
          }}
          onClose={() => setCropAt(null)}
        />
      )}
    </Modal>
  );
}

// Full-screen: drag a box around just the big number, then read digits only.
function CropReader({ src, onRead, onClose }) {
  const imgRef = useRef(null);
  const start = useRef(null);
  const [sel, setSel] = useState(null); // fractions of the image
  const [note, setNote] = useState('');

  const pointOf = (e) => {
    const r = imgRef.current.getBoundingClientRect();
    return { x: Math.min(Math.max(e.clientX - r.left, 0), r.width) / r.width, y: Math.min(Math.max(e.clientY - r.top, 0), r.height) / r.height };
  };
  const down = (e) => {
    e.preventDefault();
    e.currentTarget.setPointerCapture?.(e.pointerId);
    start.current = pointOf(e);
  };
  const move = (e) => {
    if (!start.current) return;
    const p = pointOf(e);
    const a = start.current;
    setSel({ x: Math.min(a.x, p.x), y: Math.min(a.y, p.y), w: Math.abs(a.x - p.x), h: Math.abs(a.y - p.y) });
  };
  const up = () => (start.current = null);

  async function read() {
    if (!sel || sel.w < 0.02 || sel.h < 0.02) return setNote('Drag a box around the number first.');
    try {
      setNote('Reading…');
      await loadTesseract();
      if (!digitWorker) {
        digitWorker = await window.Tesseract.createWorker('eng');
        await digitWorker.setParameters({ tessedit_char_whitelist: '0123456789.', tessedit_pageseg_mode: '7' });
      }
      const { data } = await digitWorker.recognize(await cropToDataUrl(src, sel));
      const raw = parseFloat((data.text || '').replace(/[^0-9.]/g, ''));
      if (Number.isNaN(raw)) return setNote('Still couldn’t read it — close this and type the number in.');
      onRead(raw);
    } catch (err) {
      setNote(err.message || 'Reading failed — type the number in instead.');
    }
  }

  return createPortal(
    <div className="crop-overlay" role="dialog" aria-label="Box the number">
      <p className="crop-hint">Drag a box around just the big number, then tap Read number.</p>
      <div className="crop-stage" onPointerDown={down} onPointerMove={move} onPointerUp={up} onPointerCancel={up}>
        <img ref={imgRef} src={src} alt="" draggable={false} />
        {sel && <span className="crop-box" style={{ left: `${sel.x * 100}%`, top: `${sel.y * 100}%`, width: `${sel.w * 100}%`, height: `${sel.h * 100}%` }} />}
      </div>
      {note && <p className="crop-hint">{note}</p>}
      <div className="row-gap center">
        <button className="btn glass" onClick={onClose}>
          Cancel
        </button>
        <button className="btn primary" onClick={read}>
          Read number
        </button>
      </div>
    </div>,
    document.body,
  );
}
