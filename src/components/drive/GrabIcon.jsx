// App-style Grab mark: white "Grab" on a green rounded square. Drawn in SVG, no image file.
export default function GrabIcon({ size = 20 }) {
  return (
    <svg className="grab-icon" width={size} height={size} viewBox="0 0 100 100" aria-hidden="true">
      <rect width="100" height="100" rx="22" fill="#00b14f" />
      <text x="50" y="62" textAnchor="middle" fill="#fff" fontFamily="Nunito, 'Baloo 2', Arial, sans-serif" fontWeight="900" fontSize="34" letterSpacing="-1">
        Grab
      </text>
    </svg>
  );
}
