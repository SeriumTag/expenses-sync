import { useEffect, useRef, useState } from 'react';

// Camera QR scanner. The library is loaded on demand to keep the main bundle small.
export default function Scanner({ onResult, onCancel }) {
  const [error, setError] = useState('');
  const done = useRef(false);
  const resultRef = useRef(onResult);
  resultRef.current = onResult;

  useEffect(() => {
    let scanner = null;
    let started = false;
    let cancelled = false;

    import('html5-qrcode')
      .then(({ Html5Qrcode }) => {
        if (cancelled) return;
        scanner = new Html5Qrcode('qr-reader', { verbose: false });
        return scanner
          .start(
            { facingMode: 'environment' },
            { fps: 10, qrbox: { width: 220, height: 220 } },
            (text) => {
              if (done.current) return;
              done.current = true;
              scanner
                .stop()
                .catch(() => {})
                .finally(() => resultRef.current(text));
            },
            () => {},
          )
          .then(() => {
            started = true;
            if (cancelled) scanner.stop().catch(() => {});
          });
      })
      .catch((e) => setError(typeof e === 'string' ? e : e?.message || 'Camera not available.'));

    return () => {
      cancelled = true;
      if (scanner && started && !done.current) scanner.stop().catch(() => {});
    };
  }, []);

  return (
    <div className="scanner">
      <div id="qr-reader" />
      {error && <p className="error">Camera error: {error}. You can type the code instead.</p>}
      <button type="button" className="btn ghost" onClick={onCancel}>
        Cancel scan
      </button>
    </div>
  );
}
