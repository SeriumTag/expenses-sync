import { THEMES, normalizeTheme } from '../lib/theme';
import { LogoMark } from './Logo';
import Modal from './Modal';

export default function ThemeDialog({ theme, onChange, onClose }) {
  const current = normalizeTheme(theme);
  const isCustom = !THEMES.some((t) => t.value === current);

  return (
    <Modal title="Theme colour" onClose={onClose}>
      <p className="muted small">
        This changes the app only for you. Your partner sees your edits highlighted in this colour.
      </p>

      <div className="theme-preview" aria-hidden="true">
        <LogoMark size={30} />
        <div>
          <div className="theme-preview-title">Preview</div>
          <div className="theme-preview-bar" />
        </div>
        <span className="btn primary sm">Button</span>
      </div>

      <div className="swatches">
        {THEMES.map((t) => (
          <button
            key={t.value}
            className={`swatch ${t.value === current ? 'on' : ''}`}
            style={{ '--c': t.value }}
            onClick={() => onChange(t.value)}
            aria-pressed={t.value === current}
          >
            <span className="swatch-dot" />
            <span className="swatch-name">{t.name}</span>
          </button>
        ))}
        <label className={`swatch custom ${isCustom ? 'on' : ''}`} style={{ '--c': current }}>
          <span className="swatch-dot rainbow">
            <input type="color" value={current} onChange={(e) => onChange(e.target.value)} aria-label="Custom colour" />
          </span>
          <span className="swatch-name">Custom</span>
        </label>
      </div>
    </Modal>
  );
}
