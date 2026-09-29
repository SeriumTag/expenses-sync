// The app's mark: a smiling little coin pouch. The body takes the user's
// theme colour; the tie (with its heart) and frill stay lavender and mint.
export function LogoMark({ size = 24, className = '' }) {
  return (
    <svg className={`logo-mark ${className}`} width={size} height={size} viewBox="12 6 76 88" aria-hidden="true">
      <path className="lm-frill" d="M37 18c1-7 6-11 13-8 7-3 12 1 13 8Z" />
      <path className="lm-body" d="M20 50c0-15 9-23 22-23h16c13 0 22 8 22 23v14c0 16-11 26-27 26h-6c-16 0-27-10-27-26Z" />
      <path className="lm-band" d="M33 22.5a5 5 0 0 1 5-5h24a5 5 0 0 1 0 10H38a5 5 0 0 1-5-5Z" />
      <path className="lm-shine" d="M28 48c1-6 5-10 11-11" />
      <path
        className="lm-heart"
        d="M50 26.2c-.5-.4-4.6-3-4.6-5.8 0-1.5 1.2-2.6 2.5-2.6.9 0 1.6.5 2.1 1.1.5-.6 1.2-1.1 2.1-1.1 1.3 0 2.5 1.1 2.5 2.6 0 2.8-4.1 5.4-4.6 5.8Z"
      />
      <ellipse className="lm-cheek" cx="33.5" cy="66" rx="5" ry="3.2" />
      <ellipse className="lm-cheek" cx="66.5" cy="66" rx="5" ry="3.2" />
      <circle className="lm-eye" cx="40" cy="58.5" r="3.4" />
      <circle className="lm-eye" cx="60" cy="58.5" r="3.4" />
      <circle className="lm-glint" cx="41.2" cy="57.3" r="1.1" />
      <circle className="lm-glint" cx="61.2" cy="57.3" r="1.1" />
      <path className="lm-smile" d="M45.5 64.5q4.5 4.2 9 0" />
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
