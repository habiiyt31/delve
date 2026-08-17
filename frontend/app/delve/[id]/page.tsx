"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { useWallet } from "@/lib/useWallet";
import {
  getGame,
  getDungeonMap,
  takeAction,
  ACTION_PRESETS,
  type Game,
  type DungeonMap as DungeonMapData,
} from "@/lib/contract";
import { StatusPill } from "@/components/StatusPill";
import { ActivityFeed } from "@/components/ActivityFeed";
import { VitalityDial } from "@/components/VitalityDial";
import { DungeonMap } from "@/components/DungeonMap";
import { TurnVerdict } from "@/components/TurnVerdict";

function outcome(g: Game): "active" | "victory" | "death" {
  if (g.status === "active") return "active";
  return g.endedReason === "VICTORY" ? "victory" : "death";
}

export default function DelveDetailPage() {
  const params = useParams<{ id: string }>();
  const gameId = Number(params.id);
  const { address, connect, connecting } = useWallet();

  const [game, setGame] = useState<Game | null>(null);
  const [mapData, setMapData] = useState<DungeonMapData>({});
  const [loading, setLoading] = useState(true);
  const [actionText, setActionText] = useState("");
  const [acting, setActing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function load() {
    try {
      setGame(await getGame(gameId));
    } catch (err: any) {
      setError(err?.message ?? "Couldn't load this delve.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
    getDungeonMap().then(setMapData).catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [gameId]);

  async function handleAct(e: React.FormEvent) {
    e.preventDefault();
    if (!address) return connect();
    if (!actionText.trim()) return;
    setActing(true);
    setError(null);
    const turnBefore = game?.turn;
    try {
      await takeAction(address, gameId, actionText.trim());
      setActionText("");
      await load();
    } catch (err: any) {
      const message = err?.message ?? "That action failed.";
      // "Still waiting on validator consensus" means OUR wait window
      // gave up client-side -- it does NOT mean the write failed.
      // GenLayer consensus can take an extra validator rotation longer
      // than usual, and by the time we're in this catch block the turn
      // has often already landed. Check the real chain state before
      // alarming the player with an error that isn't actually true.
      if (message.includes("Still waiting on validator consensus")) {
        const fresh = await getGame(gameId).catch(() => null);
        if (fresh && turnBefore !== undefined && fresh.turn > turnBefore) {
          setGame(fresh);
          setActionText("");
        } else {
          setError(message);
        }
      } else {
        setError(message);
      }
    } finally {
      setActing(false);
    }
  }

  if (loading) return <div className="panel text-center text-sm text-ink-600">Loading delve…</div>;
  if (error && !game) return <div className="panel border-brick-500/40 text-center text-sm text-brick-400">{error}</div>;
  if (!game) return null;

  const gameOver = game.status === "ended";

  return (
    <div className="mx-auto max-w-lg space-y-6">
      <div className="panel space-y-5">
        {/* Header */}
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="font-mono text-[11px] uppercase tracking-wide text-ink-700">
              Delve #{gameId}
            </p>
            <h1 className="mt-1 font-display text-2xl font-semibold tracking-tight">{game.hero}</h1>
            <p className="mt-0.5 text-sm text-ink-600">{game.roomName}</p>
          </div>
          <StatusPill status={outcome(game)} />
        </div>

        {/* Vitality + map, side by side */}
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div className="flex flex-col items-center rounded-md border border-ink-700 bg-ink-800/40 px-4 py-4">
            <VitalityDial hp={game.hp} />
          </div>
          <div className="flex flex-col items-center rounded-md border border-ink-700 bg-ink-800/40 px-4 py-4">
            <DungeonMap mapData={mapData} visited={game.visited} current={game.room} />
            <p className="mt-1 text-[11px] text-ink-600">Read live from get_map()</p>
          </div>
        </div>

        {/* Core terms */}
        <div>
          <div className="panel-row">
            <span className="text-sm text-ink-600">Turn</span>
            <span className="figure text-sm text-parchment">{game.turn}</span>
          </div>
          <div className="panel-row">
            <span className="text-sm text-ink-600">Room id</span>
            <span className="figure text-sm text-parchment">{game.room}</span>
          </div>
          <div className="panel-row items-start">
            <span className="text-sm text-ink-600">Inventory</span>
            <span className="flex flex-wrap justify-end gap-1.5 pl-4">
              {game.inventory.length > 0 ? (
                game.inventory.map((item) => (
                  <span
                    key={item}
                    className="rounded-full border border-rune-violet/30 bg-rune-violet/10 px-2 py-0.5 text-[11px] text-rune-violet-light"
                  >
                    {item}
                  </span>
                ))
              ) : (
                <span className="text-xs text-ink-600">Empty-handed</span>
              )}
            </span>
          </div>
          <div className="panel-row">
            <span className="text-sm text-ink-600">Player</span>
            <span className="figure truncate pl-4 text-xs text-ink-500">{game.player}</span>
          </div>
        </div>

        <TurnVerdict
          action={game.lastAction}
          narrative={game.lastNarrative}
          itemFound={game.lastItemFound || undefined}
        />

        {/* Action area */}
        {gameOver ? (
          <div
            className={
              game.endedReason === "VICTORY"
                ? "rounded-md border border-sage-500/30 bg-sage-500/5 px-4 py-3 text-center font-display text-sm text-sage-400"
                : "rounded-md border border-brick-500/30 bg-brick-500/5 px-4 py-3 text-center font-display text-sm text-brick-400"
            }
          >
            {game.endedReason === "VICTORY"
              ? "The throne room falls silent behind you. Victory."
              : "The dungeon claims another delver. This run has ended."}
          </div>
        ) : (
          <form onSubmit={handleAct} className="space-y-3">
            <div className="flex flex-wrap gap-2">
              {ACTION_PRESETS.map((preset) => (
                <button
                  key={preset}
                  type="button"
                  className="chip-button"
                  disabled={acting}
                  onClick={() => setActionText(preset)}
                >
                  {preset}
                </button>
              ))}
            </div>
            <div className="flex gap-2">
              <input
                className="field-input flex-1"
                placeholder="What does your hero do?"
                value={actionText}
                onChange={(e) => setActionText(e.target.value)}
              />
              <button type="submit" className="btn-primary shrink-0" disabled={acting}>
                {!address
                  ? connecting ? "Connecting…" : "Connect wallet"
                  : acting ? "Validators are ruling…" : "Act"}
              </button>
            </div>
            {error && <p className="text-sm text-brick-400">{error}</p>}
          </form>
        )}
      </div>

      <div className="panel">
        <h2 className="mb-3 font-display text-sm font-semibold text-parchment">History for this delve</h2>
        <ActivityFeed
          filterFn={(e) => e.functionName === "take_action" && Number(e.args[0]) === gameId}
        />
      </div>
    </div>
  );
}
