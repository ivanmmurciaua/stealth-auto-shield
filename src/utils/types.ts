export type SupportedNetwork = "mainnet" | "sepolia";
export type EthereumAddress = `0x${string}`;
export type RailgunAddress = `0zk${string}`;

export const AccountIndex = {
  deposit: 0,
  receive: 1,
};

export interface DerivedEOA {
  address: EthereumAddress;
  privateKey: EthereumAddress;
  derivationPath: string;
  nonce: number;
}

export interface DerivedRailgun {
  address: RailgunAddress;
  encryptionKey: string;
  id: string;
}

export type BroadcasterFeeConfig = {
  tokenAddress: EthereumAddress;
  amount: bigint;
  recipientAddress: RailgunAddress;
};
