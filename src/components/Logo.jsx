// The ribbon "E" from the app icon, tinted with the user's theme colour.
export function LogoMark({ size = 24, className = '' }) {
  return (
    <svg
      className={`logo-mark ${className}`}
      width={size}
      height={Math.round((size * 590) / 460)}
      viewBox="290 220 460 590"
      aria-hidden="true"
    >
      <path className="lm-stem" d="M318 236 H462 V788 H318 Z" />
      <g className="lm-bars">
        <path d="M404 236 H736 L694 374 H404 Z" />
        <path d="M404 443 H652 L612 581 H404 Z" />
        <path d="M404 650 H736 L694 788 H404 Z" />
      </g>
    </svg>
  );
}

export function Wordmark({ className = '' }) {
  return (
    <span className={`wordmark ${className}`}>
      Expense<b>Sync</b>
    </span>
  );
}
