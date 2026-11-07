// Standing's mark: a person standing their ground, on a base line. White on pine in both themes.
export function Logo({ size = 24 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 64 64" aria-hidden="true" style={{ display: "block", flexShrink: 0 }}>
      <rect width="64" height="64" rx="14" fill="#1f4d3f" />
      <circle cx="32" cy="13.500" r="6" fill="#fff" />
      <path d="M27.500 23h9v15h-9z" fill="#fff" />
      <path d="M28 25 20 32l7.500 6M36 25l8 7-7.500 6" fill="none" stroke="#fff" strokeWidth="4" />
      <path d="M29.500 37 26.500 47M34.500 37l3 10" fill="none" stroke="#fff" strokeWidth="5" />
      <path d="M11 49.500h42" stroke="#fff" strokeWidth="4.500" />
    </svg>
  );
}
