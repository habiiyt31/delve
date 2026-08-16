import type { DungeonMap as DungeonMapData } from "@/lib/contract";

/**
 * Coordinates are presentation-only — the contract's get_map() only
 * knows room ids, names, and exits (see ROOM_GRAPH in
 * contracts/delve_dungeon.py). This layout just has to agree with those
 * ids; it never needs to be kept in sync with any game logic.
 */
const ROOM_LAYOUT: Record<string, { x: number; y: number; label: string }> = {
  entrance: { x: 140, y: 195, label: "Entrance" },
  crypt_stairs: { x: 75, y: 150, label: "Crypt Stairs" },
  flooded_hall: { x: 205, y: 150, label: "Flooded Hall" },
  black_abyss: { x: 15, y: 150, label: "Black Abyss" },
  bone_library: { x: 75, y: 90, label: "Bone Library" },
  old_forge: { x: 205, y: 90, label: "Old Forge" },
  throne_room: { x: 140, y: 35, label: "Throne Room" },
  treasury: { x: 205, y: 35, label: "Treasury" },
};

function buildEdges(mapData: DungeonMapData): [string, string][] {
  const edges: [string, string][] = [];
  const seen = new Set<string>();
  for (const [roomId, room] of Object.entries(mapData || {})) {
    for (const exit of room.exits || []) {
      const key = [roomId, exit].sort().join("|");
      if (seen.has(key)) continue;
      seen.add(key);
      if (ROOM_LAYOUT[roomId] && ROOM_LAYOUT[exit]) edges.push([roomId, exit]);
    }
  }
  return edges;
}

export function DungeonMap({
  mapData,
  visited,
  current,
}: {
  mapData: DungeonMapData;
  visited: string[];
  current?: string;
}) {
  const edges = buildEdges(mapData);
  const visitedSet = new Set(visited);

  return (
    <svg viewBox="0 0 220 220" className="w-full max-w-[260px]" role="img" aria-label="Dungeon map">
      {edges.map(([a, b]) => {
        const pa = ROOM_LAYOUT[a];
        const pb = ROOM_LAYOUT[b];
        const lit = visitedSet.has(a) && visitedSet.has(b);
        return (
          <line
            key={`${a}-${b}`}
            x1={pa.x}
            y1={pa.y}
            x2={pb.x}
            y2={pb.y}
            className={lit ? "stroke-ember-500" : "stroke-ink-700"}
            strokeWidth={lit ? 2 : 1.4}
          />
        );
      })}
      {Object.entries(ROOM_LAYOUT).map(([id, pos]) => {
        const isVisited = visitedSet.has(id);
        const isCurrent = id === current;
        return (
          <g key={id}>
            <circle
              cx={pos.x}
              cy={pos.y}
              r={isCurrent ? 8 : 6}
              strokeWidth={1.6}
              className={
                isCurrent
                  ? "fill-ember-400 stroke-parchment"
                  : isVisited
                    ? "fill-ember-600/40 stroke-ember-500"
                    : "fill-ink-800 stroke-ink-600"
              }
            />
            <text
              x={pos.x}
              y={pos.y + 16}
              textAnchor="middle"
              className="fill-ink-600"
              fontSize="6.5"
              fontFamily="var(--font-mono)"
            >
              {pos.label}
            </text>
          </g>
        );
      })}
    </svg>
  );
}
