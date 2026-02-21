import {
  startRailgunEngine,
  stopRailgunEngine,
  loadProvider,
  createRailgunWallet,
  loadWalletByID,
  gasEstimateForShieldBaseToken,
  populateShieldBaseToken,
  ArtifactStore,
  // setLoggers,
  refreshBalances,
  setOnBalanceUpdateCallback,
} from "@railgun-community/wallet";

import {
  TXIDVersion,
  type RailgunERC20AmountRecipient,
  NETWORK_CONFIG,
  EVMGasType,
  RailgunBalancesEvent,
  // getEVMGasTypeForTransaction,
} from "@railgun-community/shared-models";

import { Wallet as EthersWallet, JsonRpcProvider } from "ethers";
import { Level } from "level";
import { CHAIN_IDS, config, hideAddress } from "./config.js";
import { sleep } from "./monitor.js";

import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ARTIFACTS_DIR = path.join(__dirname, "..", ".railgun-artifacts");
const DB_PATH = path.join(__dirname, "..", ".railgun-db", "engine.db");

let railgunWalletId: string = config.railgunWalletId;
let railgunAddress: string = "";

// === Change if needed ===
const BALANCES_POLL_INTERVAL = 10;
let balanceSpendable = 0n;
let balancePending = 0n;

export function getRailgunAddress(): string {
  return railgunAddress;
}

export async function hasShieldedToRailgun(
  eoaAddress: string,
): Promise<boolean> {
  const etherscanApiUrl = "https://api.etherscan.io/v2/api";
  const url = `${etherscanApiUrl}?chainid=${CHAIN_IDS[config.networkStr]}&module=account&action=txlist&address=${eoaAddress}&page=1&offset=10&sort=asc&apikey=${config.etherscanApiKey}`;

  const response = await fetch(url);
  const data = await response.json();

  if (data.status === "0") return false;

  const txs: any[] = data.result ?? [];
  return txs.some(
    (tx) =>
      tx.to?.toLowerCase() ===
      NETWORK_CONFIG[config.network].relayAdaptContract.toLowerCase(),
  );
}

async function getEncryptionKey(): Promise<string> {
  const { keccak256, toUtf8Bytes } = await import("ethers");
  const hash = keccak256(toUtf8Bytes(config.railgunDbPassword));
  return hash.slice(2); // without 0x → 64 chars hex = 32 bytes
}

// ArtifactStore: RAILGUN download ZK artifacts (~50MB) and caches them here
function createArtifactStore(dir: string): ArtifactStore {
  fs.mkdirSync(dir, { recursive: true });
  return new ArtifactStore(
    async (artifactPath: string) => {
      const fullPath = `${dir}/${artifactPath}`;
      if (!fs.existsSync(fullPath)) return null;
      return fs.readFileSync(fullPath);
    },
    async (
      dirPath: string,
      artifactPath: string,
      item: string | Uint8Array,
    ) => {
      const fullDir = `${dir}/${dirPath}`;
      fs.mkdirSync(fullDir, { recursive: true });
      fs.writeFileSync(`${fullDir}/${artifactPath}`, item);
    },
    async (artifactPath: string) => {
      const fullPath = `${dir}/${artifactPath}`;
      return fs.existsSync(fullPath);
    },
  );
}

export async function initRailgun(): Promise<void> {
  console.log("=== RAILGUN ENGINE ===");

  // LevelDB according to the official RAILGUN documentation
  fs.mkdirSync(path.dirname(DB_PATH), { recursive: true });
  const db = new Level(DB_PATH);
  console.log(`DB: ${DB_PATH}`);

  // Artifact store
  const artifactStore = createArtifactStore(ARTIFACTS_DIR);
  console.log(`Artifacts: ${ARTIFACTS_DIR}\n`);

  console.log(
    "Starting RAILGUN engine (first time download ~50MB of ZK artifacts)...",
  );

  await startRailgunEngine(
    "dksaprgnpoc", // walletSource — máx 16 chars, lowercase
    db,
    false, // shouldDebug — engine verbose logs
    artifactStore,
    false, // useNativeArtifacts (false = wasm, Node compatible)
    false, // skipMerkletreeScans
    ["https://ppoi-agg.horsewithsixlegs.xyz"], // POI node — from community
    [], // customPOILists
    false, // verboseScanLogging — scan verbose logs
  );
  console.log("RAILGUN engine started\n");

  // Graceful shutdown
  process.on("SIGINT", async () => {
    console.log("Shutting down RAILGUN engine...");
    await stopRailgunEngine();
    process.exit(0);
  });

  // console.log(`Connecting to RPC: ${config.rpcUrl.split("/v2/")[0]}...`);

  await loadProvider(
    {
      chainId: NETWORK_CONFIG[config.network].chain.id,
      providers: [{ provider: config.rpcUrl, priority: 1, weight: 2 }],
    },
    config.network,
  );
  console.log("RPC connected to use RAILGUN successfully\n");
  const encryptionKey = await getEncryptionKey();

  if (railgunWalletId) {
    console.log(
      `Loading existing RAILGUN wallet: ${hideAddress(railgunWalletId)}`,
    );
    const railgunWalletInfo = await loadWalletByID(
      encryptionKey,
      railgunWalletId,
      false,
    );
    if (!railgunWalletInfo) throw new Error(`Error loading RAILGUN wallet`);
    railgunAddress = railgunWalletInfo.railgunAddress;
    console.log(`Wallet loaded successfully: ${hideAddress(railgunAddress)}`);
  } else {
    console.log("Loading RAILGUN wallet from seed....");
    const creationBlockMap = {
      [config.network]: NETWORK_CONFIG[config.network].deploymentBlock,
    };
    const railgunWalletInfo = await createRailgunWallet(
      encryptionKey,
      config.seed,
      creationBlockMap,
    );
    if (!railgunWalletInfo) throw new Error(`Error creating wallet from seed`);
    railgunWalletId = railgunWalletInfo.id;
    railgunAddress = railgunWalletInfo.railgunAddress;
    console.log(`RAILGUN wallet created successfully!`);
    console.log(`0zk address: ${hideAddress(railgunAddress)}`);
    console.log(
      `You can save this ID ${railgunWalletId} in your .env for quicker engine start`,
    );
  }
  console.log("======================");
}

export async function shieldETH(
  stealthEOAPrivateKey: string,
  amountWei: bigint,
  stealthSafeAddress: string,
): Promise<string> {
  console.log(`Starting shield from ${stealthSafeAddress}`);

  const provider = new JsonRpcProvider(config.rpcUrl);
  const signer = new EthersWallet(stealthEOAPrivateKey, provider);
  const shieldPrivateKey = signer.signingKey.privateKey as `0x${string}`;

  const erc20AmountRecipient: RailgunERC20AmountRecipient = {
    tokenAddress: NETWORK_CONFIG[config.network].baseToken.wrappedAddress,
    amount: amountWei,
    recipientAddress: railgunAddress,
  };

  // console.log("Estimating gas...");
  const gasEstimateResponse = await gasEstimateForShieldBaseToken(
    TXIDVersion.V2_PoseidonMerkle,
    config.network,
    railgunAddress,
    shieldPrivateKey,
    erc20AmountRecipient,
    signer.address,
  );
  const gasEstimate = gasEstimateResponse.gasEstimate;
  console.log(`Estimated gas: ${gasEstimate}`);

  // Subtract gas from the amount
  const feeData = await provider.getFeeData();
  const maxFeePerGas = feeData.maxFeePerGas ?? 20000000000n;
  const maxPriorityFeePerGas = feeData.maxPriorityFeePerGas ?? 1000000000n;

  const MIN_SHIELD_AMOUNT = 10000000000000000n;

  const gasCost = gasEstimate * maxFeePerGas;
  const buffer = gasCost / 5n; // 20%
  const netAmount = amountWei - gasCost - buffer;

  if (amountWei < MIN_SHIELD_AMOUNT) {
    throw new Error(`Insufficient balance to shield. Minimum: 0.01 ETH`);
  }

  if (netAmount <= 0n)
    throw new Error(
      `Insufficient balance to cover gas. Balance: ${amountWei}, Gas: ${gasCost}`,
    );

  console.log(`Net amount (after gas): ${netAmount} wei`);

  const populateResponse = await populateShieldBaseToken(
    TXIDVersion.V2_PoseidonMerkle,
    config.network,
    railgunAddress,
    shieldPrivateKey,
    { ...erc20AmountRecipient, amount: netAmount },
    {
      evmGasType: EVMGasType.Type2 as const,
      gasEstimate,
      maxFeePerGas,
      maxPriorityFeePerGas,
    },
  );

  const transaction = populateResponse.transaction;

  console.log("Sending tx...");
  const tx = await signer.sendTransaction(transaction);
  console.log(`Transaction sent: ${tx.hash}`);
  await tx.wait();
  console.log(
    `Tx completed: ${netAmount} wei → RAILGUN address: ${hideAddress(railgunAddress)}`,
  );
  return tx.hash;
}

// === SCAN BALANCES ===
export function setupBalanceCallback(): void {
  setOnBalanceUpdateCallback((balancesEvent: RailgunBalancesEvent) => {
    // DEBUG
    // console.log(`Updated balances for chain: ${balancesEvent.chain.id}`);
    // console.log(balancesEvent);
    // for (const erc20 of balancesEvent.erc20Amounts) {
    //   console.log(`  ${erc20.tokenAddress}: ${erc20.amount} wei`);
    // }
    //
    const total = balancesEvent.erc20Amounts.reduce(
      (acc, e) => acc + e.amount,
      0n,
    );
    if (total === 0n) return;

    if (balancesEvent.balanceBucket === "Spendable") {
      balanceSpendable = total;
      // console.log(`Spendable balance: ${total} wei`);
    } else if (balancesEvent.balanceBucket === "ShieldPending") {
      balancePending = total;
      // console.log(`Pending to shield: ${total} wei`);
    }
  });
}

export async function scanRailgunBalances(): Promise<bigint[]> {
  const chain = NETWORK_CONFIG[config.network].chain;
  console.log("\nRefreshing RAILGUN balances...");
  try {
    await refreshBalances(chain, [railgunWalletId]);
    await sleep(BALANCES_POLL_INTERVAL);
    return [balanceSpendable, balancePending];
  } catch (err: any) {
    console.error(`Error refresh balances: ${err.message}`);
    return [0n, 0n];
  }
}
