"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { getGameCount, getGame, type Game } from "@/lib/contract";
import { StatusPill } from "@/components/StatusPill";

type Row = Game & { id: number };

function outcome(g: Game): "active" | "victory" | "death" {
  if (g.status === "active") return "active";
  return g.endedReason === "VICTORY" ? "victory" : "death";
}

export default function DelvesPage() {
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function load() {
      try {
        const count = await getGameCount();
        const ids = Array.from({ length: count }, (_, i) => i);
        const games = await Promise.all(ids.map(async (id) => ({ ...(await getGame(id)), id })));
        setRows(games.reverse());
      } catch (err: any) {
        setError(err?.message ?? "Couldn't load delves.");
      } finally {
        setLoading(false);
      }
    }
    load();
  }, []);

  return (
    <div className="mx-auto max-w-xl space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="font-display text-2xl font-semibold italic tracking-tight">Delves</h1>
        <Link href="/delve/new" className="btn-primary">Start a delve</Link>
      </div>

      {loading && <div className="panel text-center text-sm text-ink-600">Loading…</div>}
      {error && <div className="panel border-brick-500/40 text-center text-sm text-brick-400">{error}</div>}

      {!loading && !error && rows.length === 0 && (
        <div className="void-state">
          <p>No delves yet.</p>
          <Link href="/delve/new" className="text-ember-400 hover:text-ember-300">
            Send in the first hero →
          </Link>
        </div>
      )}

      <div className="panel p-0 sm:p-0">
        {rows.map((g) => (
          <Link
            key={g.id}
            href={`/delve/${g.id}`}
            className="panel-row px-5 transition hover:bg-ink-800/40 sm:px-6"
          >
            <div>
              <p className="font-mono text-[11px] text-ink-700">#{g.id}</p>
              <p className="font-display text-sm font-semibold text-parchment">{g.hero}</p>
            </div>
            <div className="text-right">
              <p className="figure text-sm text-parchment">{g.roomName}</p>
              <p className="figure text-[11px] text-ink-600">{g.hp} HP · turn {g.turn}</p>
            </div>
            <StatusPill status={outcome(g)} />
          </Link>
        ))}
      </div>
    </div>
  );
}
