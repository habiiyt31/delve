"use client";

import Link from "next/link";
import { ActivityFeed } from "@/components/ActivityFeed";
import { RuneMark } from "@/components/RuneMark";

const STEPS = [
  ["I", "Send a hero in", "Start a fresh delve at the dungeon's entrance — no setup beyond a name."],
  ["II", "Describe an action", "Say what your hero does next, in your own words, in plain text."],
  [
    "III",
    "Validators rule on it",
    "An AI narrates the outcome. Independent validators must agree on the room and the damage before it's written onchain.",
  ],
];

export default function HomePage() {
  return (
    <div className="space-y-8">
      <section className="panel">
        <div className="mb-5 flex items-center gap-3">
          <RuneMark size={40} />
          <p className="font-mono text-[11px] uppercase tracking-[0.1em] text-ink-600">
            An adjudication contract, not a script
          </p>
        </div>

        <h1 className="font-display text-2xl font-semibold italic leading-snug tracking-tight sm:text-3xl">
          Every turn is a verdict validators had to agree on.
        </h1>
        <p className="mt-3 max-w-xl text-sm leading-relaxed text-ink-600">
          Describe what your hero does. A GenLayer Intelligent Contract asks an AI to narrate the
          outcome, then makes independent validators recompute it and agree on the room you land
          in and the harm you take, before anything is written onchain. The prose is never the
          same twice — the state always is.
        </p>

        <div className="mt-6 flex flex-wrap gap-3">
          <Link href="/delve/new" className="btn-primary">Start a delve</Link>
          <Link href="/delves" className="btn-secondary">Browse delves</Link>
        </div>
      </section>

      <section>
        <h2 className="mb-3 font-display text-sm font-semibold text-parchment">How a turn is resolved</h2>
        <div className="panel">
          {STEPS.map(([n, title, body]) => (
            <div key={n} className="panel-row items-start">
              <span className="font-display text-sm italic text-rune-violet">{n}</span>
              <div className="flex-1 pl-4 text-left">
                <p className="font-display text-sm font-medium text-parchment">{title}</p>
                <p className="mt-0.5 text-xs text-ink-600">{body}</p>
              </div>
            </div>
          ))}
        </div>
      </section>

      <section className="panel">
        <h2 className="mb-3 font-display text-sm font-semibold text-parchment">Recent activity</h2>
        <ActivityFeed />
      </section>

      <Link
        href="/delves"
        className="block rounded-md border border-ink-700 px-3.5 py-2.5 text-center text-sm text-ink-600 transition hover:border-ember-500/40 hover:text-ember-300"
      >
        Browse all delves →
      </Link>
    </div>
  );
}
