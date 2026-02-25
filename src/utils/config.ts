import { JsonRpcProvider } from "ethers";
import { SupportedNetwork } from "./types";

export let provider: JsonRpcProvider;
export let network: SupportedNetwork;

export function hideAddress(address: string) {
  return address.slice(0, 4) + "..." + address.slice(-4);
}

export function clear(): void {
  console.clear();
}

export function avoidRailgunScanningErrors(): void {
  // To avoid RAILGUN level legacy error scanning balances
  const originalStderr = process.stderr.write.bind(process.stderr);
  process.stderr.write = (chunk: any, ...args: any[]) => {
    if (typeof chunk === "string" && chunk.includes("LEVEL_LEGACY"))
      return true;
    return originalStderr(chunk, ...args);
  };
}

export const setNetwork = (_network: SupportedNetwork) => {
  network = _network;
};

export const setProvider = (network: string): JsonRpcProvider => {
  if (network === "mainnet") {
    provider = new JsonRpcProvider(process.env.MAINNET_RPC_URL_1);
  } else if (network === "sepolia") {
    provider = new JsonRpcProvider(process.env.SEPOLIA_RPC_URL_1);
  } else {
    throw new Error(`Unsupported network: ${network}`);
  }
  return provider;
};
