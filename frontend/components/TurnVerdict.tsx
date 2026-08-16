export function TurnVerdict({
  action,
  narrative,
  itemFound,
}: {
  action: string;
  narrative: string;
  itemFound?: string;
}) {
  if (!narrative) return null;

  return (
    <div className="rounded-lg border border-ink-700 bg-ink-800/40 p-4">
      <p className="text-[11px] uppercase tracking-[0.08em] text-ink-600">You tried</p>
      <p className="mt-0.5 text-sm italic text-parchment">&ldquo;{action}&rdquo;</p>
      <p className="mt-3 text-[11px] uppercase tracking-[0.08em] text-rune-violet">
        The dungeon answers
      </p>
      <p className="mt-0.5 text-sm leading-relaxed text-parchment">{narrative}</p>
      {itemFound ? (
        <span className="mt-3 inline-flex items-center gap-1.5 rounded-full border border-ember-500/40 bg-ember-500/10 px-2.5 py-1 text-[11px] text-ember-300">
          Found: {itemFound}
        </span>
      ) : null}
    </div>
  );
}
