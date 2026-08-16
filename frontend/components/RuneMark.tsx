export function RuneMark({ size = 28, spin = false }: { size?: number; spin?: boolean }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 32 32"
      fill="none"
      aria-hidden
      className={spin ? "animate-[spin_3s_linear_infinite]" : undefined}
    >
      <rect width="32" height="32" rx="7" className="fill-ink-800" />
      <path d="M16 7 L23 16 L16 25 L9 16 Z" className="stroke-ember-500" strokeWidth="1.4" fill="none" />
      <circle cx="16" cy="16" r="3.2" className="fill-ember-400" />
      <path d="M16 16 L16 9" className="stroke-rune-violet" strokeWidth="1.2" strokeLinecap="round" />
    </svg>
  );
}
