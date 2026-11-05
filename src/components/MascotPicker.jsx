import { FRIENDS } from '../lib/mascot';
import Modal from './Modal';

// Choose which plush friend greets you (saved on your username, so it follows you).
export default function MascotPicker({ current, onChoose, onClose }) {
  return (
    <Modal title="Choose your character" onClose={onClose}>
      <div className="friend-grid" role="radiogroup" aria-label="Characters">
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
