/**
 * A semicircular HP dial, same shape family as this project's other
 * threshold dials. Every part still encodes something real: the three
 * colored bands ARE the danger/hurt/steady zones, and the needle
 * position IS the hero's current HP out of 100.
 */
export function VitalityDial({ hp }: { hp: number }) {
  const clamped = Math.max(0, Math.min(100, hp));
  const cx = 60;
  const cy = 54;
  const r = 44;

  const angleFor = (position: number) => 180 - position * 180;
  const pointAt = (angleDeg: number) => {
    const rad = (angleDeg * Math.PI) / 180;
    return { x: cx + r * Math.cos(rad), y: cy - r * Math.sin(rad) };
  };

  const bands: Array<[number, number, string]> = [
    [0, 0.25, "stroke-brick-500"],
    [0.25, 0.55, "stroke-amber-500"],
    [0.55, 1, "stroke-sage-500"],
  ];

  const needleAngle = angleFor(clamped / 100);
  const needleInset = {
    x: cx + (r - 8) * Math.cos((needleAngle * Math.PI) / 180),
    y: cy - (r - 8) * Math.sin((needleAngle * Math.PI) / 180),
  };

  return (
    <svg viewBox="0 0 120 64" className="w-full max-w-[220px]">
      {bands.map(([from, to, cls]) => {
        const start = pointAt(angleFor(from));
        const end = pointAt(angleFor(to));
        return (
          <path
            key={`${from}-${to}`}
            d={`M ${start.x} ${start.y} A ${r} ${r} 0 0 1 ${end.x} ${end.y}`}
            fill="none"
            className={cls}
            strokeWidth="2"
            strokeLinecap="round"
          />
        );
      })}
      <circle cx={cx} cy={cy} r="2" className="fill-ink-600" />
      <line
        x1={cx}
        y1={cy}
        x2={needleInset.x}
        y2={needleInset.y}
        className="stroke-ember-400"
        strokeWidth="2"
        strokeLinecap="round"
      />
      <circle cx={needleInset.x} cy={needleInset.y} r="2.5" className="fill-ember-400" />
      <text x={cx - r} y={cy + 14} className="fill-ink-600" fontSize="7" fontFamily="var(--font-mono)">
        0
      </text>
      <text
        x={cx + r}
        y={cy + 14}
        textAnchor="end"
        className="fill-ink-600"
        fontSize="7"
        fontFamily="var(--font-mono)"
      >
        100
      </text>
      <text x={cx} y={cy - r - 6} textAnchor="middle" className="fill-parchment" fontSize="9" fontFamily="var(--font-display)">
        {clamped} HP
      </text>
    </svg>
  );
}
