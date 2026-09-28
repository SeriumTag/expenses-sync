import { useState } from 'react';
import { QRCodeSVG } from 'qrcode.react';
import { MAX_MEMBERS, removeMember, rotateCode, updateMeta } from '../lib/db';
import { extractCode } from '../lib/format';
import LiveInput from './LiveInput';
import Modal from './Modal';
import Scanner from './Scanner';

export default function ShareDialog({ ledgerId, meta, members, username, onJoin, onClose }) {
  const [code, setCode] = useState('');
  const [scanning, setScanning] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [copied, setCopied] = useState(false);

  const isOwner = meta.owner === username;
  const partner = members.find((m) => m !== username);
  const full = members.length >= MAX_MEMBERS;
  const link = `${window.location.origin}/?join=${meta.code}`;

  async function join(raw) {
    setBusy(true);
    setError('');
    try {
      await onJoin(extractCode(raw));
      onClose();
    } catch (e) {
      setError(e.message);
      setBusy(false);
    }
  }

  async function copyLink() {
    try {
      if (navigator.share) await navigator.share({ title: 'Join my expenses', url: link });
      else await navigator.clipboard.writeText(link);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      /* share sheet dismissed */
    }
  }

  async function kick() {
    if (!window.confirm(`Remove ${partner} from this account? They'll lose access right away.`)) return;
    await removeMember(ledgerId, partner);
    // New code so the old QR/link can't be reused.
    await rotateCode(ledgerId, meta.code);
  }

  async function leave() {
    if (!window.confirm('Leave this shared account? You’ll need a new code to rejoin.')) return;
    await removeMember(ledgerId, username);
  }

  return (
    <Modal title="Share & sync" onClose={onClose}>
      <section className="dialog-section">
        <h3>Share this account</h3>
        {full ? (
          <div className="shared-with">
            <p>
              Shared with <b>{partner}</b>. This account is full ({MAX_MEMBERS}/{MAX_MEMBERS} people).
            </p>
            {isOwner ? (
              <button className="btn danger sm" onClick={kick}>
                Remove {partner}
              </button>
            ) : (
              <button className="btn danger sm" onClick={leave}>
                Leave account
              </button>
            )}
          </div>
        ) : (
          <div className="share-box">
            <div className="qr">
              <QRCodeSVG value={link} size={156} />
            </div>
            <div>
              <div className="code" aria-label="Share code">
                {meta.code}
              </div>
              <p className="muted small">
                Your partner can scan the QR, open the link, or type the code. Only 1 person can join.
              </p>
              <div className="row-gap">
                <button className="btn sm" onClick={copyLink}>
                  {copied ? 'Copied!' : 'Share link'}
                </button>
                <button className="btn sm ghost" onClick={() => rotateCode(ledgerId, meta.code)}>
                  New code
                </button>
              </div>
            </div>
          </div>
        )}
      </section>

      <section className="dialog-section">
        <h3>Join someone else’s account</h3>
        <form
          className="join-row"
          onSubmit={(e) => {
            e.preventDefault();
            join(code);
          }}
        >
          <input
            value={code}
            onChange={(e) => setCode(e.target.value.toUpperCase())}
            placeholder="CODE"
            maxLength={10}
            autoCapitalize="characters"
            spellCheck={false}
          />
          <button className="btn primary" disabled={!code.trim() || busy}>
            Join
          </button>
          <button type="button" className="btn" onClick={() => setScanning(true)}>
            Scan QR
          </button>
        </form>
        {scanning && (
          <Scanner
            onResult={(text) => {
              setScanning(false);
              join(text);
            }}
            onCancel={() => setScanning(false)}
          />
        )}
        {error && <p className="error">{error}</p>}
      </section>

      <section className="dialog-section">
        <h3>Settings</h3>
        <label className="field">
          <span>Account name</span>
          <LiveInput fieldKey="meta:name" value={meta.name} onSave={(v) => updateMeta(ledgerId, { name: v })} />
        </label>
        <label className="field">
          <span>Currency symbol</span>
          <LiveInput
            fieldKey="meta:currency"
            value={meta.currency}
            onSave={(v) => updateMeta(ledgerId, { currency: v })}
            maxLength={4}
          />
        </label>
      </section>
    </Modal>
  );
}
