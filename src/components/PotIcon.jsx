// Little green savings pot shown beside items tracked as a savings pot.
export default function PotIcon({ size = 16, title = 'Savings pot' }) {
  return (
    <svg className="pot-icon" width={size} height={size} viewBox="0 0 24 24" role="img" aria-label={title}>
      <title>{title}</title>
      <ellipse cx="12" cy="6.2" rx="6.2" ry="1.9" fill="#4fae86" />
      <path d="M5.6 7.4h12.8l-.9 10.2a3.2 3.2 0 0 1-3.2 2.9H9.7a3.2 3.2 0 0 1-3.2-2.9Z" fill="#6cc4a1" />
      <path d="M8 9.8h8" stroke="#fff" strokeWidth="1.3" strokeLinecap="round" opacity="0.7" />
      <circle cx="12" cy="14.2" r="2.6" fill="#fff4c8" stroke="#e7b94a" strokeWidth="1" />
      <path d="M12 12.9v2.6" stroke="#d49a2a" strokeWidth="1" strokeLinecap="round" />
      <circle cx="15.6" cy="3.6" r="1.6" fill="#f6d06f" stroke="#e7b94a" strokeWidth=".8" />
    </svg>
  );
}
