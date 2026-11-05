import { FRIENDS } from '../lib/mascot';
import Modal from './Modal';

// Choose a plush friend: the one that greets you, or a group's character
// (allowNone adds a "No character" choice).
export default function MascotPicker({ current, onChoose, onClose, title = 'Choose your character', allowNone = false }) {
  return (
    <Modal title={title} onClose={onClose}>
      <div className="friend-grid" role="radiogroup" aria-label="Characters">
        {allowNone && (
          <button
            role="radio"
            aria-checked={!current}
            className={`friend-opt ${!current ? 'on' : ''}`}
            onClick={() => {
              onChoose(null);
              onClose();
            }}
          >
            <span className="friend-none" aria-hidden="true">∅</span>
            <span>No character</span>
          </button>
        )}
        {FRIENDS.map((f) => (
          <button
            key={f.key}
            role="radio"
            aria-checked={current === f.key}
            className={`friend-opt ${current === f.key ? 'on' : ''}`}
            onClick={() => {
              onChoose(f.key);
              onClose();
            }}
          >
            <img src={f.src} alt="" width="84" height="84" />
            <span>{f.name}</span>
          </button>
        ))}
      </div>
    </Modal>
  );
}
