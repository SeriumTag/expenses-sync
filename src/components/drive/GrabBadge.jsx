// The little green "Grab" mark on a Grab income (drawn in CSS, no logo file).
export default function GrabBadge({ small = false }) {
  return (
    <span className={`grab-badge ${small ? 'sm' : ''}`} aria-hidden="true">
      🚗 Grab
    </span>
  );
}
