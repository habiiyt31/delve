import { createClient } from "genlayer-js";
import { studionet, testnetBradbury } from "genlayer-js/chains";

const NETWORK = process.env.NEXT_PUBLIC_GENLAYER_NETWORK ?? "studionet";

// No explicit return type here on purpose: genlayer-js/chains doesn't
// export a public "GenLayerChain" type to annotate this with, and
// guessing at internal type names has broken the build before. Letting
// TypeScript infer the return type from studionet/testnetBradbury
// themselves is more resilient to the SDK's internal type layout
// changing between versions.
export function resolveChain() {
  switch (NETWORK) {
    case "studionet":
      return studionet;
    case "testnetBradbury":
      return testnetBradbury;
    default:
      throw new Error(
        `Unknown NEXT_PUBLIC_GENLAYER_NETWORK "${NETWORK}". Use "studionet" or "testnetBradbury".`
      );
  }
}

export const CONTRACT_ADDRESS = (process.env.NEXT_PUBLIC_CONTRACT_ADDRESS ?? "") as any;

/** Read-only client. No wallet needed. */
export function getReadClient() {
  return createClient({
    chain: resolveChain(),
  });
}

/**
 * Normalizes a wallet-supplied address before it's ever sent to the
 * RPC. Different wallets return `eth_accounts`/`eth_requestAccounts`
 * results in different casing (lowercase, or EIP-55 checksummed), and
 * the GenLayer Studio RPC has been observed rejecting some of those
 * variants with "Invalid params: Incorrect address format" (a
 * server-side -32602 error, not a viem client-side check). Lowercase
 * hex is universally accepted by Ethereum-style JSON-RPC servers, so
 * normalizing to it here removes the wallet/browser-dependent variance.
 */
function normalizeAddress(address: string): `0x${string}` {
  const trimmed = (address ?? "").trim();
  if (!/^0x[0-9a-fA-F]{40}$/.test(trimmed)) {
    throw new Error(`Wallet returned an invalid address: "${address}"`);
  }
  return trimmed.toLowerCase() as `0x${string}`;
}

/** Write client bound to the connected MetaMask address. */
export function getWriteClient(walletAddress: string) {
  if (typeof window === "undefined" || !window.ethereum) {
    throw new Error("No browser wallet found. Install MetaMask to continue.");
  }
  return createClient({
    chain: resolveChain(),
    account: normalizeAddress(walletAddress),
    provider: window.ethereum,
  });
}

/**
 * Ensures the connected wallet is on the configured GenLayer network.
 *
 * IMPORTANT: this intentionally does NOT call genlayer-js's built-in
 * `client.connect()`. That helper unconditionally calls the MetaMask
 * Snaps RPC methods (`wallet_getSnaps` / `wallet_requestSnaps`) to
 * install the GenLayer wallet-plugin snap -- something only real
 * MetaMask supports. Any other EIP-1193 wallet (Rabby, OKX Wallet,
 * Coinbase Wallet, Brave Wallet, etc.) throws "method [wallet_getSnaps]
 * doesn't has corresponding handler" the moment connect() runs, which
 * breaks every write/sign flow for those users.
 *
 * We don't need the snap here: `getWriteClient` already binds
 * `account: walletAddress` + `provider: window.ethereum`, which is the
 * documented "MetaMask handles signing" pattern -- genlayer-js proxies
 * eth_sendTransaction/eth_signTransaction straight to the injected
 * provider. Network correctness only requires the standard
 * EIP-3085/3326 methods below, which every injected wallet implements.
 */
export async function ensureCorrectNetwork(walletAddress: string) {
  const client = getWriteClient(walletAddress);
  const chain = resolveChain();
  const provider = window.ethereum;
  const expectedChainIdHex = `0x${chain.id.toString(16)}`;

  try {
    const currentChainId: string = await provider.request({ method: "eth_chainId" });

    if (currentChainId !== expectedChainIdHex) {
      try {
        await provider.request({
          method: "wallet_switchEthereumChain",
          params: [{ chainId: expectedChainIdHex }],
        });
      } catch (switchErr: any) {
        // 4902 = chain not added to the wallet yet -- add then retry switch.
        if (switchErr?.code === 4902) {
          await provider.request({
            method: "wallet_addEthereumChain",
            params: [
              {
                chainId: expectedChainIdHex,
                chainName: chain.name,
                rpcUrls: chain.rpcUrls.default.http,
                nativeCurrency: chain.nativeCurrency,
                blockExplorerUrls: chain.blockExplorers?.default?.url
                  ? [chain.blockExplorers.default.url]
                  : undefined,
              },
            ],
          });
          await provider.request({
            method: "wallet_switchEthereumChain",
            params: [{ chainId: expectedChainIdHex }],
          });
        } else {
          throw switchErr;
        }
      }
    }
  } catch (err: any) {
    throw new Error(
      `Please switch your wallet to ${chain.name} (chain ID ${chain.id}) and try again. (${
        err?.message ?? err
      })`
    );
  }

  return client;
}

declare global {
  interface Window {
    ethereum?: any;
  }
}
