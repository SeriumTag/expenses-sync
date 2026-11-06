// The Happy Fish mark: a white fish (shaped like an α) on a blue circle. Drawn in SVG, no image file.
export default function HappyFishIcon({ size = 16 }) {
  return (
    <svg className="hf-icon" width={size} height={size} viewBox="0 0 100 100" aria-hidden="true">
      <circle cx="50" cy="50" r="49" fill="#2f55c4" />
      <circle cx="50" cy="50" r="45.5" fill="none" stroke="#fff" strokeWidth="2" />
      <path d="M64 58 C60 24 18 22 18 55 C18 88 60 90 64 62 Z" fill="#fff" />
      <path d="M61 55 Q65 33 76 24 M61 63 Q67 80 80 81" fill="none" stroke="#fff" strokeWidth="15" strokeLinecap="round" />
      <ellipse cx="45" cy="42" rx="4.5" ry="6.5" fill="#2f55c4" />
    </svg>
  );
}
