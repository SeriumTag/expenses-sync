// The app's mark: Duffy the bear in a little round frame.
export function LogoMark({ size = 24, className = '' }) {
  return <img className={`logo-mark ${className}`} src="/duffy.webp" width={size} height={size} alt="" aria-hidden="true" />;
}

export function Wordmark({ className = '' }) {
  return (
    <span className={`wordmark ${className}`}>
      Expense<b>Sync</b>
    </span>
  );
}
