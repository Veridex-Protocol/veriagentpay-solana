/** Utility functions for Solana explorer links. */

const EXPLORER_BASE_URL = process.env.NEXT_PUBLIC_SOLANA_EXPLORER_URL || 'https://explorer.solana.com';
const CLUSTER = process.env.NEXT_PUBLIC_SOLANA_CLUSTER || 'devnet';

function clusterQuery(): string {
  return CLUSTER === 'mainnet-beta' ? '' : `?cluster=${encodeURIComponent(CLUSTER)}`;
}

export function getExplorerTxUrl(txHash: string, _chainId?: string | number): string {
  return `${EXPLORER_BASE_URL}/tx/${txHash}${clusterQuery()}`;
}

export function getExplorerAddressUrl(address: string, _chainId?: string | number): string {
  return `${EXPLORER_BASE_URL}/address/${address}${clusterQuery()}`;
}

export function getExplorerBlockUrl(blockNumber: number | string): string {
  return `${EXPLORER_BASE_URL}/block/${blockNumber}${clusterQuery()}`;
}

export function formatTxHash(txHash: string, startChars: number = 10, endChars: number = 8): string {
  if (!txHash || txHash.length < startChars + endChars) {
    return txHash;
  }
  return `${txHash.substring(0, startChars)}...${txHash.substring(txHash.length - endChars)}`;
}
