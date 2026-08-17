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
 * Per GenLayer's own docs for the browser-wallet flow
 * (docs.genlayer.com/developers/decentralized-applications/writing-data
 * → "Using a Browser Wallet (MetaMask)"), `client.connect(network)` is
 * the officially documented way to do this and must be called before
 * writing. We try that first.
 *
 * As a safety net, if `connect()` throws -- e.g. because it depends on
 * a MetaMask-only Snaps RPC method (`wallet_getSnaps` /
 * `wallet_requestSnaps`) that other EIP-1193 wallets like Rabby, OKX
 * Wallet, or Coinbase Wallet don't implement -- we fall back to the
 * plain EIP-3085/3326 switch/add-chain calls below, which every
 * injected wallet supports. This keeps the officially documented path
 * for real MetaMask users while not hard-breaking everyone else.
 */
export async function ensureCorrectNetwork(walletAddress: string) {
  const client = getWriteClient(walletAddress);
  const chain = resolveChain();

  try {
    await client.connect(NETWORK as any);
    return client;
  } catch {
    // Fall through to the manual flow below.
  }

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
