// Every delete / remove asks twice: first what will happen, then a final
// "are you sure" so a slip of the finger can't remove anything.
export function confirmTwice(message, what = 'this') {
  if (!window.confirm(message)) return false;
  return window.confirm(`Please confirm again: remove ${what}?\n\nTap OK to remove, or Cancel to keep it.`);
}
