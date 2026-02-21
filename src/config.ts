import { NetworkName } from "@railgun-community/shared-models";

export function hideAddress(address: string) {
  return address.slice(0, 4) + "..." + address.slice(-4);
}

function required(key: string): string {
  const val = process.env[key];
  if (!val || val.trim() === "") {
    throw new Error(`Missing required env var: ${key}`);
  }
  return val.trim();
}

function optional(key: string, fallback: string): string {
  return process.env[key]?.trim() || fallback;
}

function networkFromString(s: string): NetworkName {
  const map: Record<string, NetworkName> = {
    ethereum: NetworkName.Ethereum,
    sepolia: NetworkName.EthereumSepolia,
    polygon: NetworkName.Polygon,
  };
  const net = map[s.toLowerCase()];
  if (!net)
    throw new Error(`Unknown NETWORK: ${s}. Use: ethereum | sepolia | polygon`);
  return net;
}

export const CHAIN_IDS: Record<string, number> = {
  ethereum: 1,
  sepolia: 11155111,
  polygon: 137,
};

export const config = {
  seed: required("SEED"),
  fluidkeyPin: required("FLUIDKEY_PIN"),
  rpcUrl: required("RPC_URL"),
  etherscanApiKey: required("ETHERSCAN_API_KEY"),
  railgunDbPassword: required("RAILGUN_DB_PASSWORD"),
  nonce: optional("STARTING_NONCE", "0"),
  network: networkFromString(optional("NETWORK", "sepolia")),
  networkStr: optional("NETWORK", "sepolia"),
  pollIntervalSeconds: parseInt(optional("POLL_INTERVAL_SECONDS", "15")),
  railgunWalletId: optional("RAILGUN_WALLET_ID", ""),
} as const;
