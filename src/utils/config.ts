import { JsonRpcProvider } from "ethers";
import { SupportedNetwork } from "./types";
import { NetworkName } from "@railgun-community/shared-models";

export let provider: JsonRpcProvider;
export let network: SupportedNetwork;
export let railgunNetwork: NetworkName;

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

export function avoidRailgunErrors(): void {
  process.on("unhandledRejection", (err: any) => {
    if (err?.message?.includes("Failed to refresh POIs")) return;
    console.error("Unhandled rejection:", err);
  });
}

export const setNetwork = (_network: SupportedNetwork) => {
  network = _network;
  railgunNetwork =
    network === "mainnet" ? NetworkName.Ethereum : NetworkName.EthereumSepolia;
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
