import { validateMnemonic } from "bip39";
import { HDNodeWallet } from "ethers";

import { NETWORK_CONFIG } from "@railgun-community/shared-models";
import { provider, railgunNetwork } from "../utils/config";
import {
  AccountIndex,
  DerivedEOA,
  DerivedRailgun,
  EthereumAddress,
  RailgunAddress,
} from "../utils/types";
import { printSuccess } from "../ui/console";

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

export async function getEphemeralEOA(
  seed: string,
  opType: number,
): Promise<DerivedEOA> {
  let selectedEOA;
  let addressIndex = 0;

  while (true) {
    selectedEOA = deriveEOA(seed, opType, addressIndex);

    if (selectedEOA) {
      if (opType === AccountIndex.deposit) {
        const nonce = await provider.getTransactionCount(selectedEOA.address);
        if (nonce === 0) {
          printSuccess(
            `EOA found: ${selectedEOA.address} (index ${addressIndex})`,
          );
          break;
        }
      } else {
        const balance = await provider.getBalance(selectedEOA.address);
        if (balance === 0n) {
          printSuccess(
            `EOA found: ${selectedEOA.address} (index ${addressIndex})`,
          );
          break;
        }
      }

      addressIndex++;
      // DEBUG
      // printInfo(
      //   `EOA ${depositEOA.address} already used (nonce ${nonce}), trying next...`,
      // );
    }
  }
  return selectedEOA;
}

export function validateSeed(seed: string): boolean {
  return validateMnemonic(seed.trim());
}

/**
 * Derives an Ethereum EOA from the seed.
 *
 * @param seed  - seed phrase (12 or 24 words)
 * @param accountIndex - account index (the derivation "nonce")
 * @param addressIndex - address index within the account
 */
export function deriveEOA(
  seed: string,
  accountIndex = 0,
  addressIndex = 0,
): DerivedEOA {
  const path = eoaDerivationPath(accountIndex, addressIndex);
  const wallet = HDNodeWallet.fromPhrase(seed.trim(), undefined, path);

  return {
    address: wallet.address as EthereumAddress,
    privateKey: wallet.privateKey as EthereumAddress,
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
 * Derives the RAILGUN ID (0zk address) from the seed.
 * Requires the engine to be initialized (initRailgunEngine).
 *
 * @param seed   - seed phrase
 */
export async function deriveRailgun(seed: string): Promise<DerivedRailgun> {
  const { createRailgunWallet } = await import("@railgun-community/wallet");

  const creationBlockMap = {
    [railgunNetwork]: NETWORK_CONFIG[railgunNetwork].deploymentBlock,
  };

  const encryptionKey = await getEncryptionKey("testing");

  const railgunWallet = await createRailgunWallet(
    encryptionKey,
    seed,
    creationBlockMap,
  );

  return {
    address: railgunWallet.railgunAddress as RailgunAddress,
    encryptionKey: encryptionKey,
    id: railgunWallet.id,
  };
}

// export interface WalletDerivation {
//   eoa: DerivedEOA;
//   railgun: DerivedRailgunID;
// }
//
// export async function deriveAll(
//   seed: string,
//   opts: {
//     eoaAccountIndex?: number;
//     eoaAddressIndex?: number;
//     network?: SupportedNetwork;
//   } = {},
// ): Promise<WalletDerivation> {
//   const {
//     eoaAccountIndex = 0,
//     eoaAddressIndex = 0,
//     network = "mainnet",
//   } = opts;

//   const eoa = deriveEOA(seed, eoaAccountIndex, eoaAddressIndex);
//   const railgun = await deriveRailgunID(seed, network);

//   return { eoa, railgun };
// }
