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
import { config } from "./config.js";

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

export async function precheckStealthAccount(
  account: StealthAccount,
): Promise<bigint> {
  const provider = new JsonRpcProvider(config.rpcUrl);
  const eoaBalance = await provider.getBalance(account.stealthEOAAddress);
  return eoaBalance;
}

export function deriveEOA(): Wallet {
  const seed = Mnemonic.fromPhrase(config.seed);
  const hdNode = HDNodeWallet.fromMnemonic(seed, "m/44'/60'/0'/0/0");
  return new Wallet(hdNode.privateKey);
}

export async function initFluidkeyKeys(): Promise<FluidkeyKeys> {
  // console.log("=== DKSAP FLUIDKEY ===");

  const eoa = deriveEOA();
  // console.log(`Derived EOA from seed: ${eoa.address}`);

  const { message } = generateFluidkeyMessage({
    address: eoa.address,
    pin: config.fluidkeyPin,
  });
  const signature = (await eoa.signMessage(message)) as `0x${string}`;
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
