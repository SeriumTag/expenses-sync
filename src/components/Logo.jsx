import { useMascot } from '../lib/mascot';

// The app's mark: your chosen plush friend (Duffy until signed in) in a little round frame.
export function LogoMark({ size = 24, className = '' }) {
  const { friend } = useMascot();
  return <img className={`logo-mark ${className}`} src={friend.src} width={size} height={size} alt="" aria-hidden="true" />;
}

export function Wordmark({ className = '' }) {
  return (
    <span className={`wordmark ${className}`}>
      Expense<b>Sync</b>
    </span>
  );
}
