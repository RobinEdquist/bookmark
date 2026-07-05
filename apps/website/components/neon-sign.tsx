export function NeonSign({ size = 96 }: { size?: number }) {
  // Geometry measured off apps/web/app/icon.png (tube centerline):
  // height/width 1.35, corner radius ~0.2 of width, notch ~0.14 of height.
  return (
    <svg
      className="neon-sign neon-sign-breathe"
      viewBox="0 0 120 124"
      width={size}
      height={(size * 124) / 120}
      aria-hidden
    >
      <defs>
        <linearGradient id="neon-tube" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#ff5fd2" />
          <stop offset="0.52" stopColor="#fdeffd" />
          <stop offset="1" stopColor="#46ecfd" />
        </linearGradient>
      </defs>
      <path
        d="M26 108 V30 Q26 16 40 16 H80 Q94 16 94 30 V108 L60 95 Z"
        fill="none"
        stroke="url(#neon-tube)"
        strokeWidth="6"
        strokeLinejoin="round"
        strokeLinecap="round"
      />
    </svg>
  );
}
