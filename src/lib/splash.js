// The splash lives in index.html so it shows before any JavaScript loads.
// It stays up for at least MIN_MS so the animation can play, then zooms away.
const MIN_MS = 1300;
let hidden = false;

export function hideSplash() {
  if (hidden) return;
  hidden = true;
  const el = document.getElementById('splash');
  if (!el) return;
  const wait = Math.max(0, MIN_MS - performance.now());
  setTimeout(() => {
    el.classList.add('hide');
    setTimeout(() => el.remove(), 700);
  }, wait);
}

// Never trap anyone behind the splash if something stalls.
setTimeout(hideSplash, 8000);
