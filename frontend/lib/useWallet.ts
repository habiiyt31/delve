"use client";

import { useCallback, useEffect, useState } from "react";

const DISCONNECTED_KEY = "delve:wallet-disconnected";

export function useWallet() {
  const [address, setAddress] = useState<`0x${string}` | null>(null);
  const [connecting, setConnecting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (typeof window === "undefined" || !window.ethereum) return;

    // Respect an explicit prior disconnect — MetaMask has no real
    // "disconnect" API, so `eth_accounts` would otherwise silently
    // reconnect on every page load. We track the user's choice
    // ourselves instead of trusting the wallet's own account list.
    if (window.localStorage.getItem(DISCONNECTED_KEY) === "1") return;

    window.ethereum
      .request({ method: "eth_accounts" })
      .then((accounts: string[]) => {
        if (accounts[0]) setAddress(accounts[0] as `0x${string}`);
      })
      .catch(() => {});

    const handleAccountsChanged = (accounts: string[]) => {
      setAddress((accounts[0] as `0x${string}`) ?? null);
    };
    window.ethereum.on?.("accountsChanged", handleAccountsChanged);
    return () => {
      window.ethereum?.removeListener?.("accountsChanged", handleAccountsChanged);
    };
  }, []);

  const connect = useCallback(async () => {
    if (typeof window === "undefined" || !window.ethereum) {
      setError("No wallet found. Install MetaMask to continue.");
      return;
    }
    setConnecting(true);
    setError(null);
    try {
      const accounts: string[] = await window.ethereum.request({
        method: "eth_requestAccounts",
      });
      window.localStorage.removeItem(DISCONNECTED_KEY);
      setAddress((accounts[0] as `0x${string}`) ?? null);
    } catch (err: any) {
      setError(err?.message ?? "Failed to connect wallet");
    } finally {
      setConnecting(false);
    }
  }, []);

  const disconnect = useCallback(() => {
    window.localStorage.setItem(DISCONNECTED_KEY, "1");
    setAddress(null);
    setError(null);
  }, []);

  return { address, connecting, error, connect, disconnect };
}
