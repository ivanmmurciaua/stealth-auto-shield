import { validateMnemonic } from "bip39";
import { HDNodeWallet } from "ethers";
import { NetworkName } from "@railgun-community/shared-models";
import type { SupportedNetwork } from "../init/railgun.js";

import { NETWORK_CONFIG } from "@railgun-community/shared-models";

export interface DerivedEOA {
  address: string;
  privateKey: string;
  derivationPath: string;
  nonce: number;
}

export interface DerivedRailgunID {
  zkAddress: string;
  railgunID: string;
}

export interface WalletDerivation {
  eoa: DerivedEOA;
  railgun: DerivedRailgunID;
}

/**
 * Standard BIP44 path for Ethereum EOA.
 * Nonce here = account index.
 *
 * m/44'/60'/0'/0/{index}  → change the last one for Fluidkey stealth
 */
export function eoaDerivationPath(
  accountIndex: number,
  addressIndex = 0,
): string {
  return `m/44'/60'/${accountIndex}'/0/${addressIndex}`;
}

/**
 * RAILGUN uses its own internal path.
 * The SDK manages it; we only need the mnemonic + index.
 */
export function railgunDerivationPath(index = 0): string {
  return `RAILGUN internal — index ${index}`;
}

export function validateSeed(mnemonic: string): boolean {
  return validateMnemonic(mnemonic.trim());
}

/**
 * Derives an Ethereum EOA from the mnemonic.
 *
 * @param mnemonic  - seed phrase (12 or 24 words)
 * @param accountIndex - account index (the derivation "nonce")
 * @param addressIndex - address index within the account
 */
export function deriveEOA(
  mnemonic: string,
  accountIndex = 0,
  addressIndex = 0,
): DerivedEOA {
  const path = eoaDerivationPath(accountIndex, addressIndex);
  const wallet = HDNodeWallet.fromPhrase(mnemonic.trim(), undefined, path);

  return {
    address: wallet.address,
    privateKey: wallet.privateKey,
    derivationPath: path,
    nonce: accountIndex,
  };
}

async function getEncryptionKey(secret: string): Promise<string> {
  const { keccak256, toUtf8Bytes } = await import("ethers");
  const hash = keccak256(toUtf8Bytes(secret));
  return hash.slice(2); // without 0x → 64 chars hex = 32 bytes
}

/**
 * Derives the RAILGUN ID (0zk address) from the mnemonic.
 * Requires the engine to be initialized (initRailgunEngine).
 *
 * @param mnemonic   - seed phrase
 * @param network    - network for the 0zk address
 */
export async function deriveRailgunID(
  mnemonic: string,
  network: SupportedNetwork = "mainnet",
): Promise<DerivedRailgunID> {
  const { createRailgunWallet } = await import("@railgun-community/wallet");

  const networkName =
    network === "mainnet" ? NetworkName.Ethereum : NetworkName.EthereumSepolia;

  const creationBlockMap = {
    [networkName]: NETWORK_CONFIG[networkName].deploymentBlock,
  };

  const encryptionKey = await getEncryptionKey("testing");

  const railgunWallet = await createRailgunWallet(
    encryptionKey,
    mnemonic,
    creationBlockMap,
  );

  return {
    zkAddress: railgunWallet.railgunAddress,
    railgunID: railgunWallet.id,
  };
}

export async function deriveAll(
  mnemonic: string,
  opts: {
    eoaAccountIndex?: number;
    eoaAddressIndex?: number;
    network?: SupportedNetwork;
  } = {},
): Promise<WalletDerivation> {
  const {
    eoaAccountIndex = 0,
    eoaAddressIndex = 0,
    network = "mainnet",
  } = opts;

  const eoa = deriveEOA(mnemonic, eoaAccountIndex, eoaAddressIndex);
  const railgun = await deriveRailgunID(mnemonic, network);

  return { eoa, railgun };
}
