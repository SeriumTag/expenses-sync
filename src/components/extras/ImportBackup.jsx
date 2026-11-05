import { useRef, useState } from 'react';
import { confirmTwice } from '../../lib/confirm';
import { patchPath } from '../../lib/db';
import Modal from '../Modal';

// Bring one page's data over from a Body Log backup (📤 Export backup there).
// plan(text) reads the backup and returns { patch, summary } — only what isn't
// here yet (patch paths are relative to `path`), so importing twice adds nothing.
export default function ImportBackup({ path, what, plan, onClose }) {
  const [text, setText] = useState('');
  const [result, setResult] = useState('');
  const [error, setError] = useState('');
  const fileRef = useRef(null);

  async function run(raw) {
    setError('');
    setResult('');
    try {
      const { patch, summary } = plan(raw);
      if (!Object.keys(patch).length) return setResult('Everything in that backup is already here — nothing new to add.');
      if (!confirmTwice(`Add ${summary}?`, 'these entries')) return;
      await patchPath(path, patch);
      setResult(`Imported ${summary}.`);
    } catch (e) {
      setError(e.message || 'Couldn’t import that.');
    }
  }

  function pickFile(e) {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (file) file.text().then(run);
  }

  return (
    <Modal title="Import from Body Log" onClose={onClose}>
      <div className="sheet">
        <p className="muted small">In Body Log, tap 📤 Export backup and save the file. Then choose it here, or paste its text. Only {what} is brought over — nothing else.</p>
        <input ref={fileRef} type="file" accept="application/json,.json,.txt" hidden onChange={pickFile} />
        <button className="btn primary" onClick={() => fileRef.current?.click()}>
          Choose backup file
        </button>
        <textarea className="import-text" value={text} onChange={(e) => setText(e.target.value)} placeholder="…or paste the backup text here" rows={5} />
        {text.trim() && (
          <button className="btn glass" onClick={() => run(text)}>
            Import pasted text
          </button>
        )}
        {result && <p className="pos">{result}</p>}
        {error && <p className="error">{error}</p>}
        <div className="row-gap end">
          <button className="btn ghost" onClick={onClose}>
            Close
          </button>
        </div>
      </div>
    </Modal>
  );
}

// Reads a Body Log backup ({ app: 'body-log', stores: { key: [...] } }).
export function backupStores(text) {
  let data;
  try {
    data = JSON.parse(text);
  } catch {
    throw new Error('That isn’t a Body Log backup file (it couldn’t be read).');
  }
  return data?.stores || data || {};
}

// "2 rides, 1 petrol fill" — counts with the right singular/plural.
export const countText = (n, one, many) => `${n} ${n === 1 ? one : many}`;
// Firebase keys can't contain . # $ / [ ]
export const safeKey = (id) => String(id).replace(/[.#$/[\]]/g, '_');
