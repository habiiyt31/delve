"use client";

import { useEffect, useState } from "react";
import { getActivityLog, explorerTxUrl, type ActivityEntry } from "@/lib/activityLog";
import { reconcilePendingActivity } from "@/lib/contract";

function shortHash(hash: string) {
  return `${hash.slice(0, 8)}···${hash.slice(-6)}`;
}

function timeAgo(ts: number): string {
  const seconds = Math.floor((Date.now() - ts) / 1000);
  if (seconds < 60) return `${seconds}s ago`;
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  return `${hours}h ago`;
}

const STATUS_LABEL: Record<ActivityEntry["status"], string> = {
  pending: "Pending",
  finalized: "Finalized",
  "pending-long": "Still finalizing",
};

const STATUS_COLOR: Record<ActivityEntry["status"], string> = {
  pending: "text-amber-400",
  finalized: "text-sage-400",
  "pending-long": "text-amber-400",
};

export function ActivityFeed({ filterFn }: { filterFn?: (e: ActivityEntry) => boolean }) {
  const [entries, setEntries] = useState<ActivityEntry[]>([]);

  useEffect(() => {
    function refresh() {
      const all = getActivityLog();
      setEntries(filterFn ? all.filter(filterFn) : all);
    }

    refresh();
    reconcilePendingActivity().then(refresh);

    window.addEventListener("delve:activity-updated", refresh);
    window.addEventListener("storage", refresh);
    const interval = setInterval(() => {
      reconcilePendingActivity().then(refresh);
    }, 8000);
    return () => {
      window.removeEventListener("delve:activity-updated", refresh);
      window.removeEventListener("storage", refresh);
      clearInterval(interval);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (entries.length === 0) {
    return (
      <p className="py-2 text-sm text-ink-600">
        No transactions from this browser yet — they'll show up here as you delve.
      </p>
    );
  }

  return (
    <div>
      {entries.map((e) => (
        <a
          key={e.hash}
          href={explorerTxUrl(e.hash)}
          target="_blank"
          rel="noreferrer"
          className="panel-row group transition hover:border-ember-500/30"
        >
          <div className="flex items-baseline gap-2">
            <span className="font-mono text-xs text-parchment group-hover:text-ember-300">
              {e.functionName}
            </span>
            <span className="font-mono text-xs text-ink-600">{shortHash(e.hash)}</span>
          </div>
          <div className="flex items-center gap-3 text-xs">
            <span className={STATUS_COLOR[e.status]}>{STATUS_LABEL[e.status]}</span>
            <span className="text-ink-700">{timeAgo(e.timestamp)}</span>
          </div>
        </a>
      ))}
    </div>
  );
}
