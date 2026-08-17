import { TransactionStatus } from "genlayer-js/types";
import { CONTRACT_ADDRESS, getReadClient, ensureCorrectNetwork } from "./genlayer";
import { logActivity, getActivityLog, explorerTxUrl } from "./activityLog";

export type Game = {
  hero: string;
  player: string;
  status: "active" | "ended";
  room: string;
  roomName: string;
  hp: number;
  turn: number;
  inventory: string[];
  visited: string[];
  lastAction: string;
  lastNarrative: string;
  lastItemFound: string;
  endedReason: "" | "VICTORY" | "DEATH";
};

export type RoomInfo = { name: string; exits: string[] };
export type DungeonMap = Record<string, RoomInfo>;

function splitCsv(value: unknown): string[] {
  const str = typeof value === "string" ? value : "";
  return str.length > 0 ? str.split(",").filter(Boolean) : [];
}

// ---------------- reads ----------------

export async function getGame(gameId: number): Promise<Game> {
  const client = getReadClient();
  const raw = (await client.readContract({
    address: CONTRACT_ADDRESS,
    functionName: "get_game",
    args: [gameId],
  })) as Record<string, unknown>;

  return {
    hero: raw.hero as string,
    player: raw.player as string,
    status: raw.status as Game["status"],
    room: raw.room as string,
    roomName: raw.room_name as string,
    hp: Number(raw.hp ?? 0),
    turn: Number(raw.turn ?? 0),
    inventory: splitCsv(raw.inventory_csv),
    visited: splitCsv(raw.visited_csv),
    lastAction: (raw.last_action as string) ?? "",
    lastNarrative: (raw.last_narrative as string) ?? "",
    lastItemFound: (raw.last_item_found as string) ?? "",
    endedReason: ((raw.ended_reason as string) ?? "") as Game["endedReason"],
  };
}

export async function getGameCount(): Promise<number> {
  const client = getReadClient();
  const count = await client.readContract({
    address: CONTRACT_ADDRESS,
    functionName: "get_game_count",
    args: [],
  });
  return Number(count);
}

export async function getDungeonMap(): Promise<DungeonMap> {
  const client = getReadClient();
  const raw = await client.readContract({
    address: CONTRACT_ADDRESS,
    functionName: "get_map",
    args: [],
  });
  try {
    return JSON.parse(raw as string) as DungeonMap;
  } catch {
    return {};
  }
}

// ---------------- writes ----------------
// Every write connects the wallet to the configured network, submits,
// then waits for ACCEPTED consensus before trusting the result.
//
// ACCEPTED, not FINALIZED: per GenLayer's own docs
// (docs.genlayer.com/developers/decentralized-applications/writing-data
// → "Using a Browser Wallet (MetaMask)"), the browser-wallet example
// waits for ACCEPTED. That's the point in the transaction lifecycle
// (Pending → Proposing → Committing → Revealing → Accepted → Finalized)
// where validator consensus has already been reached and the game
// state is real -- FINALIZED is an extra confirmation-depth guarantee
// on top of that, and waiting for it was why turns were timing out
// client-side even though the transaction had already gone through.

type WriteParams = {
  address: `0x${string}`;
  functionName: string;
  args: any[];
  value: bigint;
};

/**
 * StudioNet is a shared, rate-limited RPC -- genlayer-js's
 * writeContract() internally calls eth_gasPrice/eth_estimateGas before
 * it ever submits anything, and those specific calls have been
 * observed getting rate-limited or dropped ("Failed to fetch") on
 * their own, independent of whether the actual write would have gone
 * through. writeContract has no gas/gasPrice override to skip that
 * pre-flight step (see genlayer-js's own type signature), so the fix
 * has to be a retry at this layer.
 *
 * This mirrors the `sendWithRetry` pattern GenLayer's own docs
 * recommend under "Best Practices" (same 1s/2s/3s backoff), narrowed
 * to only retry errors that look transient. A failure never reached
 * the network in this case -- no hash was returned yet -- so retrying
 * the whole submission here can't double-execute a turn the way
 * retrying an already-submitted transaction's wait step could.
 */
async function writeContractWithRetry(
  client: Awaited<ReturnType<typeof ensureCorrectNetwork>>,
  params: WriteParams,
  maxAttempts = 3
) {
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      return await client.writeContract(params);
    } catch (err: any) {
      const message = String(err?.message ?? err);
      const looksTransient =
        /rate limit|failed to fetch|network|timeout|eth_gasPrice|eth_estimateGas/i.test(message);
      const looksUserCaused = /user rejected|insufficient funds|denied/i.test(message);

      if (looksUserCaused || !looksTransient || attempt === maxAttempts) throw err;
      await new Promise((resolve) => setTimeout(resolve, 1000 * attempt));
    }
  }
  throw new Error("Could not submit the transaction after multiple attempts.");
}

async function writeAndWait(walletAddress: `0x${string}`, functionName: string, args: any[]) {
  const client = await ensureCorrectNetwork(walletAddress);
  const hash = await writeContractWithRetry(client, {
    address: CONTRACT_ADDRESS,
    functionName,
    args,
    value: BigInt(0),
  });

  logActivity({ hash, functionName, args, status: "pending", timestamp: Date.now() });

  try {
    const receipt = await client.waitForTransactionReceipt({
      hash,
      status: TransactionStatus.ACCEPTED,
      retries: 60,
      interval: 3000,
    });
    logActivity({ hash, functionName, args, status: "finalized", timestamp: Date.now() });
    return { hash, receipt };
  } catch (err: any) {
    // Consensus can take longer than our wait window even though every
    // validator is still independently narrating and voting on the
    // turn -- don't treat this as a failure, just hand back the hash so
    // the caller can point the user at the Explorer instead of showing
    // a scary error.
    logActivity({ hash, functionName, args, status: "pending-long", timestamp: Date.now() });
    throw new Error(
      `Still waiting on validator consensus (this can take longer than usual). Check the transaction directly: ${explorerTxUrl(hash)}`
    );
  }
}

export async function startGame(walletAddress: `0x${string}`, heroName: string) {
  return writeAndWait(walletAddress, "start_game", [heroName]);
}

export async function takeAction(walletAddress: `0x${string}`, gameId: number, actionText: string) {
  return writeAndWait(walletAddress, "take_action", [gameId, actionText]);
}

// ---------------- reconciliation for orphaned "pending" entries ----------------
// If a page was navigated away from / refreshed while writeAndWait was
// still awaiting finalization, that promise never gets to write the
// "finalized" update -- the transaction itself keeps going onchain, but
// the local log is stuck on "pending" forever. This re-checks any
// pending entries against the actual chain state and catches them up.
//
// This runs silently on a timer (see ActivityFeed), so a transient RPC
// hiccup here is expected and already handled below via try/catch --
// it should never surface as a user-facing error. genlayer-js itself
// calls console.error internally on a failed RPC call before throwing,
// though, and Next.js's dev overlay treats any console.error as a
// full-page error regardless of whether it was actually handled. We
// quiet the console only for the duration of this specific check (and
// only when one isn't already running) so a background retry loop
// never gets mistaken for a real fault, without touching error
// reporting anywhere else in the app.

let reconciling = false;

export async function reconcilePendingActivity(): Promise<void> {
  if (reconciling) return;

  const pending = getActivityLog().filter(
    (e) => e.status === "pending" || e.status === "pending-long"
  );
  if (pending.length === 0) return;

  reconciling = true;
  const client = getReadClient();
  const originalConsoleError = console.error;
  console.error = () => {};

  try {
    await Promise.all(
      pending.map(async (entry) => {
        try {
          await client.waitForTransactionReceipt({
            hash: entry.hash as any,
            status: TransactionStatus.ACCEPTED,
            retries: 3,
            interval: 1000,
          });
          logActivity({ ...entry, status: "finalized", timestamp: entry.timestamp });
        } catch {
          // Not finalized yet (or still can't confirm) -- try again on
          // the next reconciliation pass rather than guessing.
        }
      })
    );
  } finally {
    console.error = originalConsoleError;
    reconciling = false;
  }
}

// ---------------- helpers ----------------

export const ACTION_PRESETS = [
  "Search the room for anything useful",
  "Press forward, torch held high",
  "Rest a moment and tend your wounds",
  "Listen at the passage before moving",
];

export function shortAddress(address: string): string {
  if (!address) return "";
  return `${address.slice(0, 6)}···${address.slice(-4)}`;
}
