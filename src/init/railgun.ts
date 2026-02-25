// import { SnarkJSGroth16 } from "@railgun-community/engine";
import {
  startRailgunEngine,
  stopRailgunEngine,
  // getProver,
  setOnBalanceUpdateCallback,
  refreshBalances,
  // setLoggers,
  ArtifactStore,
  gasEstimateForShieldBaseToken,
  populateShieldBaseToken,
} from "@railgun-community/wallet";
import {
  RailgunBalancesEvent,
  FallbackProviderJsonConfig,
  NETWORK_CONFIG,
  NetworkName,
  RailgunERC20AmountRecipient,
  TXIDVersion,
  EVMGasType,
} from "@railgun-community/shared-models";
import { printInfo, printSuccess } from "../ui/console.js";
import { Level } from "level";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { DerivedEOA } from "../wallet/derive.js";
import { Wallet } from "ethers";
import { network, provider } from "../utils/config.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// ZK artifacts (~50MB, downloaded once and cached)
const ARTIFACTS_DIR = path.join(__dirname, "..", "..", ".railgun-artifacts");

// LevelDB: persistent state of the engine (merkle tree, notes, balances)
const DB_PATH = path.join(__dirname, "..", "..", ".railgun-db", "engine.db");

/**
 * Creates the ArtifactStore with disk caching
 * First run: downloads ~50MB of ZK artifacts
 * Subsequent runs: reads from disk, without network
 */
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

export interface NetworkProviders {
  // mainnet: FallbackProviderJsonConfig;
  sepolia: FallbackProviderJsonConfig;
}

/**
 * Public providers for each network.
 * In production, they would be replaced by own RPCs or Alchemy/Infura.
 */
export function buildProviders(): NetworkProviders {
  // const mainnet: FallbackProviderJsonConfig = {
  //   chainId: 1,
  //   providers: [
  //     { provider: process.env.MAINNET_RPC_URL_1!, priority: 1, weight: 2 },
  //     { provider: process.env.MAINNET_RPC_URL_2!, priority: 2, weight: 2 },
  //   ],
  // };

  const sepolia: FallbackProviderJsonConfig = {
    chainId: 11155111,
    providers: [
      {
        provider: process.env.SEPOLIA_RPC_URL_1!,
        priority: 1,
        weight: 2,
      },
      {
        provider: process.env.SEPOLIA_RPC_URL_2!,
        priority: 2,
        weight: 2,
      },
    ],
  };

  return { sepolia }; //mainnet,  };
}

/**
 * Initializes the RAILGUN engine.
 * Loads ZK artifacts (prover) and connects providers.
 *
 * Requires internet. Called when starting the CLI, without seed.
 */
export async function initRailgunEngine(): Promise<void> {
  // For debugging
  // setLoggers(
  //   (msg: string) => printInfo(`[RAILGUN] ${msg}`),
  //   (err: string) => printError(`[RAILGUN ERR] ${err}`),
  // );

  const providers = buildProviders();

  // LevelDB
  fs.mkdirSync(path.dirname(DB_PATH), { recursive: true });
  const db = new Level(DB_PATH);
  printInfo(`DB: ${DB_PATH}`);

  // ArtifactStore with cache
  const artifactStore = createArtifactStore(ARTIFACTS_DIR);
  printInfo(`Artifacts: ${ARTIFACTS_DIR}`);

  await startRailgunEngine(
    "stautoshieldcli",
    db,
    false, // shouldDebug — engine verbose logs
    artifactStore,
    false, // useNativeArtifacts
    false, // skipMerkletreeScans
    ["https://ppoi-agg.horsewithsixlegs.xyz"], // POI node — from community
    [], // customPOILists
    false, // verboseScanLogging — scan verbose logs
  );

  // Configure prover with snarkjs (Groth16)
  // getProver().setSnarkJSGroth16(SnarkJSGroth16 as any);

  // printSuccess("RAILGUN engine started");

  process.on("SIGINT", async () => {
    console.log("Shutting down RAILGUN engine...");
    await stopRailgunEngine();
    process.exit(0);
  });

  await addNetworks(providers);
}

async function addNetworks(providers: NetworkProviders): Promise<void> {
  const { loadProvider } = await import("@railgun-community/wallet");

  // Mainnet
  // await loadProvider(
  //   {
  //     chainId: providers.mainnet.chainId,
  //     providers: providers.mainnet.providers,
  //   },
  //   NetworkName.Ethereum,
  // );
  // console.log(`Network connected: Mainnet (chainId 1)`);

  // Sepolia
  await loadProvider(
    {
      chainId: providers.sepolia.chainId,
      providers: providers.sepolia.providers,
    },
    NetworkName.EthereumSepolia,
  );
  // console.log(`Network connected: Sepolia (chainId 11155111)`);
}

// ─── Balance state ----
const BALANCES_POLL_INTERVAL = 7000;
let balanceSpendable = 0n;
let balancePending = 0n;

export function setupBalanceCallback(): void {
  setOnBalanceUpdateCallback((balancesEvent: RailgunBalancesEvent) => {
    const total = balancesEvent.erc20Amounts.reduce(
      (acc, e) => acc + e.amount,
      0n,
    );
    if (total === 0n) return;
    if (balancesEvent.balanceBucket === "Spendable") {
      balanceSpendable = total;
    } else if (balancesEvent.balanceBucket === "ShieldPending") {
      balancePending = total;
    }
  });
}

export async function scanRailgunBalances(
  railgunWalletId: string,
): Promise<[bigint, bigint]> {
  const networkName =
    network === "mainnet" ? NetworkName.Ethereum : NetworkName.EthereumSepolia;
  const chain = NETWORK_CONFIG[networkName].chain;

  await refreshBalances(chain, [railgunWalletId]);
  await new Promise((r) => setTimeout(r, BALANCES_POLL_INTERVAL));

  return [balanceSpendable, balancePending];
}

//TODO: RGN Transfer

// Shield & Unshield
export async function shieldETH(
  eoa: DerivedEOA,
  railgunAddress: `0zk${string}`,
  amount: bigint,
): Promise<string> {
  console.log(`\nStarting shield from ${eoa.address}`);

  const configNetwork =
    network === "mainnet" ? NetworkName.Ethereum : NetworkName.EthereumSepolia;

  const signer = new Wallet(eoa.privateKey, provider);
  const shieldPrivateKey = signer.signingKey.privateKey as `0x${string}`;

  const erc20AmountRecipient: RailgunERC20AmountRecipient = {
    tokenAddress: NETWORK_CONFIG[configNetwork].baseToken.wrappedAddress,
    amount: amount,
    recipientAddress: railgunAddress,
  };

  // console.log("Estimating gas...");
  const gasEstimateResponse = await gasEstimateForShieldBaseToken(
    TXIDVersion.V2_PoseidonMerkle,
    configNetwork,
    railgunAddress,
    shieldPrivateKey,
    erc20AmountRecipient,
    signer.address,
  );
  const gasEstimate = gasEstimateResponse.gasEstimate;
  // console.log(`Estimated gas: ${gasEstimate}`);

  // Subtract gas from the amount
  const feeData = await provider.getFeeData();
  const maxFeePerGas = feeData.maxFeePerGas ?? 20000000000n;
  const maxPriorityFeePerGas = feeData.maxPriorityFeePerGas ?? 1000000000n;

  const MIN_SHIELD_AMOUNT = 10000000000000000n;

  const gasCost = gasEstimate * maxFeePerGas;
  const buffer = gasCost / 5n; // 20%
  const netAmount = amount - gasCost - buffer;

  if (amount < MIN_SHIELD_AMOUNT) {
    throw new Error(`Insufficient balance to shield. Minimum: 0.01 ETH`);
  }

  if (netAmount <= 0n)
    throw new Error(
      `Insufficient balance to cover gas. Balance: ${amount}, Gas: ${gasCost}`,
    );

  // console.log(`Net amount (after gas): ${netAmount} wei`);

  const populateResponse = await populateShieldBaseToken(
    TXIDVersion.V2_PoseidonMerkle,
    configNetwork,
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

  console.log("");
  printInfo("Sending tx...");
  const tx = await signer.sendTransaction(transaction);
  printInfo(`Transaction sent: ${tx.hash}`);
  await tx.wait();
  printSuccess(`Tx completed: ${netAmount} wei deposited`);
  return tx.hash;
}

//TODO: Unshield
