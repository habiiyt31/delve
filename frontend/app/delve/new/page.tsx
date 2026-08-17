"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useWallet } from "@/lib/useWallet";
import { startGame, getGameCount } from "@/lib/contract";

export default function NewDelvePage() {
  const router = useRouter();
  const { address, connect, connecting } = useWallet();

  const [heroName, setHeroName] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!address) return connect();
    setBusy(true);
    setError(null);
    let idBeforeCreate: number | null = null;
    try {
      idBeforeCreate = await getGameCount();
      await startGame(address, heroName.trim());
      router.push(`/delve/${idBeforeCreate}`);
    } catch (err: any) {
      const message = err?.message ?? "Couldn't start the delve.";
      // Same reasoning as the in-game action handler: this specific
      // message means our wait window gave up, not that the write
      // failed. idBeforeCreate was captured before the write, so it's
      // still the correct id if the delve actually went through -- send
      // the hero there instead of stranding them on this form.
      if (idBeforeCreate !== null && message.includes("Still waiting on validator consensus")) {
        router.push(`/delve/${idBeforeCreate}`);
      } else {
        setError(message);
      }
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="mx-auto max-w-lg space-y-6">
      <div>
        <h1 className="font-display text-2xl font-semibold italic tracking-tight">Send a hero in</h1>
        <p className="mt-1 text-sm text-ink-600">
          Your hero starts at the sunken entrance. What happens next is up to what you type.
        </p>
      </div>

      <form onSubmit={handleSubmit} className="panel space-y-5">
        <div>
          <label className="field-label" htmlFor="hero">Hero name</label>
          <input
            id="hero"
            type="text"
            maxLength={40}
            className="field-input"
            placeholder="Rowan the Unlucky"
            value={heroName}
            onChange={(e) => setHeroName(e.target.value)}
            required
          />
          <p className="field-hint">100 HP, empty-handed, torch in hand.</p>
        </div>

        {error && <p className="text-sm text-brick-400">{error}</p>}

        <button type="submit" className="btn-primary w-full" disabled={busy}>
          {!address
            ? connecting ? "Connecting…" : "Connect wallet to continue"
            : busy ? "Sending your hero in…" : "Start the delve"}
        </button>
      </form>
    </div>
  );
}
