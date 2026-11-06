// A bathroom weighing scale: platform with a dial window at the top. Lines use currentColor.
export default function ScaleIcon({ size = 16 }) {
  return (
    <svg className="scale-icon" width={size} height={size} viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <rect x="3" y="3" width="18" height="18" rx="5" fill="#fff" fillOpacity="0.55" />
      <path d="M7.5 10.5a4.5 4.5 0 0 1 9 0z" />
      <path d="M12 10.5l1.8-2.6" />
    </svg>
  );
}
