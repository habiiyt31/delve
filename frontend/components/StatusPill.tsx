import clsx from "clsx";

const STYLES: Record<string, string> = {
  active: "bg-ember-500/10 text-ember-400 border border-ember-500/40",
  victory: "bg-sage-500/10 text-sage-400 border border-sage-500/40",
  death: "bg-brick-500/10 text-brick-400 border border-brick-500/40",
};

const LABELS: Record<string, string> = {
  active: "active",
  victory: "victory",
  death: "fallen",
};

export function StatusPill({ status }: { status: string }) {
  return (
    <span className={clsx("pill", STYLES[status] ?? STYLES.active)}>
      <span className="h-1.5 w-1.5 rounded-full bg-current" />
      {LABELS[status] ?? status}
    </span>
  );
}
