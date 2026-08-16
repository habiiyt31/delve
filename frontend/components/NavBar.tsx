"use client";

import { useState, useRef, useEffect } from "react";
import Link from "next/link";
import { useWallet } from "@/lib/useWallet";
import { RuneMark } from "./RuneMark";

function shortAddress(addr: string) {
  return `${addr.slice(0, 6)}···${addr.slice(-4)}`;
}

export function NavBar() {
  const { address, connecting, error, connect, disconnect } = useWallet();
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);
  const network = process.env.NEXT_PUBLIC_GENLAYER_NETWORK ?? "studionet";

  useEffect(() => {
    function onClickOutside(e: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setMenuOpen(false);
      }
    }
    document.addEventListener("mousedown", onClickOutside);
    return () => document.removeEventListener("mousedown", onClickOutside);
  }, []);

  return (
    <header className="sticky top-0 z-20 border-b border-ink-700/60 bg-ink-950/90 backdrop-blur">
      <div className="mx-auto flex max-w-4xl items-center justify-between px-4 py-3 sm:px-6">
        <Link href="/" className="flex items-center gap-2.5">
          <RuneMark size={30} />
          <div className="leading-tight">
            <div className="font-display text-[16px] font-semibold italic tracking-tight">
              Delve
            </div>
            <div className="text-[11px] text-ink-600">Onchain dungeon consensus</div>
          </div>
        </Link>

        <nav className="hidden items-center gap-6 font-display text-sm text-ink-600 sm:flex">
          <Link href="/delves" className="transition hover:text-parchment">Delves</Link>
          <Link href="/delve/new" className="transition hover:text-parchment">New delve</Link>
        </nav>

        <div className="relative" ref={menuRef}>
          {address ? (
            <>
              <button
                onClick={() => setMenuOpen((v) => !v)}
                className="pill border border-sage-500/40 bg-sage-500/10 text-sage-400"
              >
                <span className="h-1.5 w-1.5 rounded-full bg-sage-400" />
                {shortAddress(address)}
              </button>
              {menuOpen && (
                <div className="absolute right-0 top-full mt-2 w-40 overflow-hidden rounded-md border border-ink-700 bg-ink-900">
                  <button
                    onClick={() => {
                      disconnect();
                      setMenuOpen(false);
                    }}
                    className="w-full px-3.5 py-2.5 text-left text-sm text-ink-600 transition hover:bg-ink-800 hover:text-parchment"
                  >
                    Disconnect
                  </button>
                </div>
              )}
            </>
          ) : (
            <button onClick={connect} disabled={connecting} className="btn-primary">
              {connecting ? "Connecting…" : "Connect wallet"}
            </button>
          )}
        </div>
      </div>

      {error && (
        <div className="mx-auto max-w-4xl px-4 pb-2 text-xs text-brick-400 sm:px-6">{error}</div>
      )}

      <div className="mx-auto flex max-w-4xl items-center gap-5 px-4 pb-3 font-display text-sm text-ink-600 sm:hidden sm:px-6">
        <Link href="/delves" className="hover:text-parchment">Delves</Link>
        <Link href="/delve/new" className="hover:text-parchment">New delve</Link>
        <span className="ml-auto font-mono text-[11px] text-ink-700">{network}</span>
      </div>
    </header>
  );
}
