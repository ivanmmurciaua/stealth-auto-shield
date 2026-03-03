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
    network === "mainnet"
      ? NetworkName.Ethereum
      : network === "arbitrum"
        ? NetworkName.Arbitrum
        : NetworkName.EthereumSepolia;
};

export const setProvider = (network: string): JsonRpcProvider => {
  provider = new JsonRpcProvider(process.env.SEPOLIA_RPC_URL_1);

  if (network === "mainnet") {
    provider = new JsonRpcProvider(process.env.MAINNET_RPC_URL_1);
  } else if (network === "arbitrum") {
    provider = new JsonRpcProvider(process.env.ARBITRUM_RPC_URL_1);
  }
  return provider;
};

export const TOKEN_SYMBOLS: Record<string, string> = {
  // Arbitrum
  "0x82af49447d8a07e3bd95bd0d56f35241523fbab1": "ETH",
  "0xaf88d065e77c8cc2239327c5edb3a432268e5831": "USDC",
  // Sepolia
  "0xfff9976782d46cc05630d1f6ebab18b2324d6b14": "ETH",
  // Mainnet
  "0xc02aaa39b223fe8d0a0e5c4f27ead9083c756cc2": "ETH",
};

export const TOKEN_DECIMALS: Record<string, number> = {
  "0x82af49447d8a07e3bd95bd0d56f35241523fbab1": 18,
  "0xfff9976782d46cc05630d1f6ebab18b2324d6b14": 18,
  "0xc02aaa39b223fe8d0a0e5c4f27ead9083c756cc2": 18,
  "0xaf88d065e77c8cc2239327c5edb3a432268e5831": 6,
};
