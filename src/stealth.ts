// === NOT USED YET ===
import {
  generateKeysFromSignature,
  extractViewingPrivateKeyNode,
  generateEphemeralPrivateKey,
  generateStealthAddresses,
  generateStealthPrivateKey,
  generateFluidkeyMessage,
} from "@fluidkey/stealth-account-kit";
import { privateKeyToAccount } from "viem/accounts";
import { JsonRpcProvider, HDNodeWallet, Mnemonic, Wallet } from "ethers";
import { deriveEOA } from "./wallet/derive.js";

export interface StealthAccount {
  stealthEOAPrivateKey: `0x${string}`; // Stealth EOA private key to recover funds importing it in your wallet directly
  stealthEOAAddress: `0x${string}`; // Stealth EOA Address
  ephemeralPrivateKey: `0x${string}`;
}

export interface FluidkeyKeys {
  spendingPrivateKey: `0x${string}`;
  viewingPrivateKey: `0x${string}`;
  spendingPublicKey: `0x${string}`;
  eoa: string;
}

// export async function precheckStealthAccount(
//   account: StealthAccount,
// ): Promise<bigint> {
//   const provider = new JsonRpcProvider(config.rpcUrl);
//   const eoaBalance = await provider.getBalance(account.stealthEOAAddress);
//   return eoaBalance;
// }

export async function initFluidkeyKeys(
  eoa: any,
  fluidkeyPin: string,
): Promise<FluidkeyKeys> {
  const wallet = new Wallet(eoa.privateKey);

  console.log(`Derived EOA from seed: ${eoa.address}`);

  const { message } = generateFluidkeyMessage({
    address: eoa.address,
    pin: fluidkeyPin,
  });
  const signature = (await wallet.signMessage(message)) as `0x${string}`;
  const { spendingPrivateKey, viewingPrivateKey } =
    generateKeysFromSignature(signature);

  const spendingAccount = privateKeyToAccount(spendingPrivateKey);
  const spendingPublicKey = spendingAccount.publicKey;

  // console.log(`Spending public key: ${spendingPublicKey}`);
  // console.log("======================\n");

  return {
    spendingPrivateKey,
    viewingPrivateKey,
    spendingPublicKey,
    eoa: eoa.address,
  };
}

export async function generateStealthAccount(
  keys: FluidkeyKeys,
  nonce: number,
): Promise<StealthAccount> {
  const viewingKeyNode = extractViewingPrivateKeyNode(
    keys.viewingPrivateKey,
    0,
  );

  const { ephemeralPrivateKey } = generateEphemeralPrivateKey({
    viewingPrivateKeyNode: viewingKeyNode,
    nonce: BigInt(nonce),
    chainId: 0,
  });

  const { stealthAddresses } = generateStealthAddresses({
    ephemeralPrivateKey,
    spendingPublicKeys: [keys.spendingPublicKey],
  });

  const stealthEOAAddress = stealthAddresses[0] as `0x${string}`;
  const ephemeralPublicKey = privateKeyToAccount(ephemeralPrivateKey).publicKey;

  const { stealthPrivateKey: stealthEOAPrivateKey } = generateStealthPrivateKey(
    {
      spendingPrivateKey: keys.spendingPrivateKey,
      ephemeralPublicKey,
    },
  );

  return {
    stealthEOAPrivateKey,
    stealthEOAAddress,
    ephemeralPrivateKey,
  };
}
