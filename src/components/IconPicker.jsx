import { ICONS } from '../lib/favs';
import Modal from './Modal';

// Pick the icon for a favourite category, or remove it from favourites.
export default function IconPicker({ label, current, isFav, onPick, onRemove, onClose }) {
  return (
    <Modal title={isFav ? `Icon for ${label}` : `Add ${label} to favourites`} onClose={onClose}>
      <p className="muted small">
        Favourites appear as a button next to Add expense and Categories, so you can open them in one tap.
      </p>
      <div className="icon-grid">
        {ICONS.map((icon) => (
          <button
            key={icon}
            className={`icon-choice ${icon === current ? 'on' : ''}`}
            onClick={() => {
              onPick(icon);
              onClose();
            }}
            aria-label={`Use ${icon}`}
            aria-pressed={icon === current}
          >
            {icon}
          </button>
        ))}
      </div>
      {isFav && (
        <div className="row-gap end">
          <button
            className="btn danger sm"
            onClick={() => {
              onRemove();
              onClose();
            }}
          >
            Remove from favourites
          </button>
        </div>
      )}
    </Modal>
  );
}
