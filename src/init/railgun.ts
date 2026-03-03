import { groth16 } from "snarkjs";
import {
  startRailgunEngine,
  stopRailgunEngine,
  getProver,
  SnarkJSGroth16,
  setOnBalanceUpdateCallback,
  refreshBalances,
  // setLoggers,
  ArtifactStore,
  gasEstimateForShieldBaseToken,
  populateShieldBaseToken,
  gasEstimateForUnprovenTransfer,
  generateTransferProof,
  populateProvedTransfer,
  populateProvedUnshieldBaseToken,
  generateUnshieldBaseTokenProof,
  gasEstimateForUnprovenUnshieldBaseToken,
  gasEstimateForUnprovenCrossContractCalls,
  generateCrossContractCallsProof,
  populateProvedCrossContractCalls,
} from "@railgun-community/wallet";

import {
  RailgunBalancesEvent,
  FallbackProviderJsonConfig,
  NETWORK_CONFIG,
  NetworkName,
  RailgunERC20AmountRecipient,
  TXIDVersion,
  EVMGasType,
  calculateGasPrice,
  TransactionGasDetails,
  FeeTokenDetails,
  getEVMGasTypeForTransaction,
  RailgunERC20Amount,
  SelectedBroadcaster,
} from "@railgun-community/shared-models";

// CONFIG
import { printInfo, printSuccess, spinner } from "../ui/console.js";
import { network, provider, railgunNetwork } from "../utils/config.js";

// BROADCASTER
import {
  calcBroadcasterFee,
  findBroadcaster,
  submitViaBroadcaster,
} from "./broadcaster.js";

// TYPES
import {
  BroadcasterFeeConfig,
  DerivedEOA,
  DerivedRailgun,
  EthereumAddress,
  RailgunAddress,
} from "../utils/types.js";

// FS
import { Level } from "level";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

import { Wallet } from "ethers";
import {
  RecipeERC20Info,
  //TODO: Implement RecipeInput type,
  setRailgunFees,
  ZeroXConfig,
  ZeroXV2SwapRecipe,
} from "@railgun-community/cookbook";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// ZK artifacts (~50MB, downloaded once and cached)
const ARTIFACTS_DIR = path.join(__dirname, "..", "..", ".railgun-artifacts");

// LevelDB: persistent state of the engine (merkle tree, notes, balances)
const DB_PATH = path.join(__dirname, "..", "..", ".railgun-db", "engine.db");

let WETHAddress: EthereumAddress;

let selectedBroadcaster: SelectedBroadcaster | undefined;

async function lookForBroadcaster(token: EthereumAddress): Promise<void> {
  const spin = spinner("Looking for available broadcaster...");
  selectedBroadcaster = await findBroadcaster(railgunNetwork, token);
  if (!selectedBroadcaster) {
    spin.fail("No broadcaster available. Try again later.");
    return;
  }
  // console.log(
  //   "[DEBUG] selectedBroadcaster:",
  //   JSON.stringify(selectedBroadcaster, null, 2),
  // );
  spin.succeed(`Broadcaster found: ${selectedBroadcaster.railgunAddress}`);
}

async function getDataFee(
  token: EthereumAddress,
): Promise<[TransactionGasDetails | undefined, FeeTokenDetails | undefined]> {
  if (selectedBroadcaster) {
    const feeData = await provider.getFeeData();
    const evmGasType = getEVMGasTypeForTransaction(railgunNetwork, false);

    const originalGasDetails: TransactionGasDetails =
      evmGasType === EVMGasType.Type2
        ? {
            evmGasType: EVMGasType.Type2,
            gasEstimate: 0n,
            maxFeePerGas: feeData.maxFeePerGas ?? 0n,
            maxPriorityFeePerGas: feeData.maxPriorityFeePerGas ?? 0n,
          }
        : {
            evmGasType: EVMGasType.Type1,
            gasEstimate: 0n,
            gasPrice: feeData.gasPrice ?? 0n,
          };

    const feeTokenDetails: FeeTokenDetails = {
      tokenAddress: token,
      feePerUnitGas: BigInt(selectedBroadcaster.tokenFee.feePerUnitGas),
    };
    return [originalGasDetails, feeTokenDetails];
  }
  return [undefined, undefined];
}

function getBroadcasterGas(
  feeTokenDetails: FeeTokenDetails,
  originalGasDetails: TransactionGasDetails,
  gasEstimate: bigint,
): [BroadcasterFeeConfig | undefined, bigint | undefined] {
  if (selectedBroadcaster) {
    const broadcasterFeeERC20AmountRecipient = calcBroadcasterFee(
      selectedBroadcaster,
      feeTokenDetails,
      { ...originalGasDetails, gasEstimate },
    );

    const overallBatchMinGasPrice = calculateGasPrice({
      ...originalGasDetails,
      gasEstimate,
    });
    return [broadcasterFeeERC20AmountRecipient, overallBatchMinGasPrice];
  }
  return [undefined, undefined];
}

/**
 * Creates the ArtifactStore with disk caching
 * First run: downloads ~50MB of ZK artifacts
 * Subsequent runs: reads from disk, without network
 */
function createArtifactStore(dir: string): ArtifactStore {
  fs.mkdirSync(dir, { recursive: true });
  return new ArtifactStore(
    async (artifactPath: string) => {
      const fullPath = path.join(dir, artifactPath);
      if (!fs.existsSync(fullPath)) return null;
      return fs.readFileSync(fullPath);
    },
    async (
      _dirPath: string,
      artifactPath: string,
      item: string | Uint8Array,
    ) => {
      const fullPath = path.join(dir, artifactPath);
      fs.mkdirSync(path.dirname(fullPath), { recursive: true });
      fs.writeFileSync(fullPath, item);
    },
    async (artifactPath: string) => {
      return fs.existsSync(path.join(dir, artifactPath));
    },
  );
}

export interface NetworkProviders {
  mainnet: FallbackProviderJsonConfig;
  sepolia: FallbackProviderJsonConfig;
  arbitrum: FallbackProviderJsonConfig;
}

/**
 * Public providers for each network.
 * In production, they would be replaced by own RPCs or Alchemy/Infura.
 */
export function buildProviders(): NetworkProviders {
  const mainnet: FallbackProviderJsonConfig = {
    chainId: 1,
    providers: [
      { provider: process.env.MAINNET_RPC_URL_1!, priority: 1, weight: 2 },
      { provider: process.env.MAINNET_RPC_URL_2!, priority: 2, weight: 2 },
    ],
  };

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

  const arbitrum: FallbackProviderJsonConfig = {
    chainId: 42161,
    providers: [
      {
        provider: process.env.ARBITRUM_RPC_URL_1!,
        priority: 1,
        weight: 2,
      },
      {
        provider: process.env.ARBITRUM_RPC_URL_2!,
        priority: 2,
        weight: 2,
      },
    ],
  };

  return { mainnet, sepolia, arbitrum };
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
  getProver().setSnarkJSGroth16(groth16 as SnarkJSGroth16);

  // printSuccess("RAILGUN engine started");

  process.on("SIGINT", async () => {
    console.log("Shutting down RAILGUN engine...");
    await stopRailgunEngine();
    process.exit(0);
  });

  await addNetworks(providers);

  WETHAddress =
    network === "arbitrum"
      ? "0x82af49447d8a07e3bd95bd0d56f35241523fbab1"
      : network === "mainnet"
        ? "0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2"
        : "0xfff9976782d46cc05630d1f6ebab18b2324d6b14";
}

async function addNetworks(providers: NetworkProviders): Promise<void> {
  const { loadProvider } = await import("@railgun-community/wallet");

  // Mainnet
  await loadProvider(
    {
      chainId: providers.mainnet.chainId,
      providers: providers.mainnet.providers,
    },
    NetworkName.Ethereum,
  );
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

  // Arbitrum
  await loadProvider(
    {
      chainId: providers.arbitrum.chainId,
      providers: providers.arbitrum.providers,
    },
    NetworkName.Arbitrum,
  );
  // console.log(`Network connected: Arbitrum (chainId 42161)`);
}

// ─── Balance state ────────────────────────────────
const BALANCES_POLL_INTERVAL = 30000;

interface TokenBalance {
  spendable: bigint;
  pending: bigint;
}

let balances: Record<string, TokenBalance> = {};

export function setupBalanceCallback(): void {
  setOnBalanceUpdateCallback((balancesEvent: RailgunBalancesEvent) => {
    if (balancesEvent.chain.id !== NETWORK_CONFIG[railgunNetwork].chain.id)
      return;

    // DEBUG
    // console.log("[BALANCE EVENT] chain:", balancesEvent.chain);
    // console.log("[BALANCE EVENT] bucket:", balancesEvent.balanceBucket);
    // console.log(
    //   "[BALANCE EVENT] erc20Amounts:",
    //   JSON.stringify(
    //     balancesEvent.erc20Amounts.map((e) => ({
    //       token: e.tokenAddress,
    //       amount: e.amount.toString(),
    //     })),
    //     null,
    //     2,
    //   ),
    // );

    for (const e of balancesEvent.erc20Amounts) {
      const token = e.tokenAddress.toLowerCase();
      if (!balances[token]) balances[token] = { spendable: 0n, pending: 0n };

      if (balancesEvent.balanceBucket === "Spendable") {
        balances[token].spendable = e.amount;
      } else if (
        balancesEvent.balanceBucket === "ShieldPending" ||
        balancesEvent.balanceBucket === "MissingExternalPOI" ||
        balancesEvent.balanceBucket === "MissingInternalPOI"
      ) {
        balances[token].pending += e.amount;
      }
    }
  });
}

export async function scanRailgunBalances(
  railgunWalletId: string,
): Promise<Record<string, TokenBalance>> {
  balances = {}; // reset before each scan
  const chain = NETWORK_CONFIG[railgunNetwork].chain;

  await Promise.race([
    refreshBalances(chain, [railgunWalletId]),
    new Promise((r) => setTimeout(r, BALANCES_POLL_INTERVAL)),
  ]);

  return balances;
}

/**
 * Shield
 * Tx to shield native ETH to wETH in RAILGUN
 */
export async function shieldETH(
  eoa: DerivedEOA,
  railgunAddress: RailgunAddress,
  amount: bigint,
): Promise<string> {
  console.log(`\nStarting shield from ${eoa.address}`);

  const signer = new Wallet(eoa.privateKey, provider);
  const shieldPrivateKey = signer.signingKey.privateKey as EthereumAddress;

  const erc20AmountRecipient: RailgunERC20AmountRecipient = {
    tokenAddress: NETWORK_CONFIG[railgunNetwork].baseToken.wrappedAddress,
    amount: amount,
    recipientAddress: railgunAddress,
  };

  // console.log("Estimating gas...");
  const gasEstimateResponse = await gasEstimateForShieldBaseToken(
    TXIDVersion.V2_PoseidonMerkle,
    railgunNetwork,
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
    railgunNetwork,
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

/**
 * Private transfer
 * Transfers wETH from 0zk to another 0zk privately
 */
export async function privateTransferETH(
  zerozk: DerivedRailgun,
  toZk: RailgunAddress,
  amount: bigint,
  memo: string = "",
  eoa: Partial<DerivedEOA> = {},
  //token: `0x{string}` // should be passed as param when imp stables
): Promise<void> {
  const token = WETHAddress;
  const erc20AmountRecipients: RailgunERC20AmountRecipient[] = [
    {
      tokenAddress: token,
      amount,
      recipientAddress: toZk,
    },
  ];

  //TODO: Implement transfer without broadcasters
  let sendWithPublicWallet = false;
  if (Object.keys(eoa).length > 0) {
    sendWithPublicWallet = true;
  }

  await lookForBroadcaster(token);

  if (selectedBroadcaster) {
    const [originalGasDetails, feeTokenDetails] = await getDataFee(token);

    if (originalGasDetails && feeTokenDetails) {
      const gasSpin = spinner("Estimating gas...");
      const { gasEstimate } = await gasEstimateForUnprovenTransfer(
        TXIDVersion.V2_PoseidonMerkle,
        railgunNetwork,
        zerozk.id,
        zerozk.encryptionKey,
        memo || undefined,
        erc20AmountRecipients,
        [],
        originalGasDetails,
        feeTokenDetails,
        sendWithPublicWallet,
      );
      gasSpin.succeed(`Gas estimated: ${gasEstimate}`);
      const [broadcasterFeeERC20AmountRecipient, overallBatchMinGasPrice] =
        getBroadcasterGas(feeTokenDetails, originalGasDetails, gasEstimate);

      // Generate proof
      const proofSpin = spinner("Generating ZK proof (~5s)...");
      await generateTransferProof(
        TXIDVersion.V2_PoseidonMerkle,
        railgunNetwork,
        zerozk.id,
        zerozk.encryptionKey,
        true,
        memo || undefined,
        erc20AmountRecipients,
        [],
        broadcasterFeeERC20AmountRecipient,
        sendWithPublicWallet,
        overallBatchMinGasPrice,
        (progress) => {
          proofSpin.text = `Generating ZK proof... ${Math.round(progress)}%`;
        },
      );
      proofSpin.succeed("ZK proof generated");

      // Populate + broadcast
      const sendSpin = spinner("Broadcasting transaction...");
      const populated = await populateProvedTransfer(
        TXIDVersion.V2_PoseidonMerkle,
        railgunNetwork,
        zerozk.id,
        true,
        memo || undefined,
        erc20AmountRecipients,
        [],
        broadcasterFeeERC20AmountRecipient,
        sendWithPublicWallet,
        overallBatchMinGasPrice,
        { ...originalGasDetails, gasEstimate },
      );

      if (overallBatchMinGasPrice) {
        await submitViaBroadcaster(
          populated,
          selectedBroadcaster,
          railgunNetwork,
          overallBatchMinGasPrice,
          false,
        );
        sendSpin.succeed("Transaction broadcasted");
        printSuccess("Private transfer complete.");
      }
    }
  }
}

export async function unshieldETH(
  zerozk: DerivedRailgun,
  destinationAddress: EthereumAddress,
  amount: bigint,
  eoa: Partial<DerivedEOA> = {},
  //token: EthereumAddress
): Promise<void> {
  const token = WETHAddress;

  const wrappedERC20Amount: RailgunERC20Amount = {
    tokenAddress: token,
    amount,
  };

  //TODO: Implement transfer without broadcasters
  let sendWithPublicWallet = false;
  if (Object.keys(eoa).length > 0) {
    sendWithPublicWallet = true;
  }

  await lookForBroadcaster(token);

  if (selectedBroadcaster) {
    const [originalGasDetails, feeTokenDetails] = await getDataFee(token);

    if (originalGasDetails && feeTokenDetails) {
      const gasSpin = spinner("Estimating gas...");
      const { gasEstimate } = await gasEstimateForUnprovenUnshieldBaseToken(
        TXIDVersion.V2_PoseidonMerkle,
        railgunNetwork,
        destinationAddress,
        zerozk.id,
        zerozk.encryptionKey,
        wrappedERC20Amount,
        originalGasDetails,
        feeTokenDetails,
        sendWithPublicWallet,
      );
      gasSpin.succeed(`Gas estimated: ${gasEstimate}`);

      const [broadcasterFeeERC20AmountRecipient, overallBatchMinGasPrice] =
        getBroadcasterGas(feeTokenDetails, originalGasDetails, gasEstimate);

      // Proof
      const proofSpin = spinner("Generating ZK proof (~5s)...");
      await generateUnshieldBaseTokenProof(
        TXIDVersion.V2_PoseidonMerkle,
        railgunNetwork,
        destinationAddress,
        zerozk.id,
        zerozk.encryptionKey,
        wrappedERC20Amount,
        broadcasterFeeERC20AmountRecipient,
        sendWithPublicWallet,
        overallBatchMinGasPrice,
        (progress: any) => {
          proofSpin.text = `Generating ZK proof... ${Math.round(progress)}%`;
        },
      );
      proofSpin.succeed("ZK proof generated");

      // Populate + broadcast
      const sendSpin = spinner("Broadcasting transaction...");
      const populated = await populateProvedUnshieldBaseToken(
        TXIDVersion.V2_PoseidonMerkle,
        railgunNetwork,
        destinationAddress,
        zerozk.id,
        wrappedERC20Amount,
        broadcasterFeeERC20AmountRecipient,
        sendWithPublicWallet,
        overallBatchMinGasPrice,
        { ...originalGasDetails, gasEstimate },
      );

      if (overallBatchMinGasPrice) {
        await submitViaBroadcaster(
          populated,
          selectedBroadcaster,
          railgunNetwork,
          overallBatchMinGasPrice,
          true,
        );
        sendSpin.succeed("Transaction broadcasted");
        printSuccess("Unshield complete.");
      }
    }
  }
}

export async function privateSwap(
  zerozk: DerivedRailgun,
  buyTokenAddress: EthereumAddress,
  amount: bigint,
  slippage: number = 50, // In basis points: 0.05%
): Promise<void> {
  const sellTokenAddress = WETHAddress; //TODO: Move to param when more tokens are available

  if (!process.env.ZEROX_API_KEY) {
    throw new Error(
      "In order to use private swap, you need to configure in your .env, ZEROX_API_KEY",
    );
  }
  ZeroXConfig.API_KEY = process.env.ZEROX_API_KEY;

  setRailgunFees(
    railgunNetwork,
    25n, // shield fee 0.25%
    25n, // unshield fee 0.25%
  );

  const sellERC20Info: RecipeERC20Info = {
    tokenAddress: sellTokenAddress,
    decimals: BigInt(18), //TODO: It depends from buyTokenAddress
    isBaseToken: false,
  };
  const buyERC20Info: RecipeERC20Info = {
    tokenAddress: buyTokenAddress,
    decimals: BigInt(6), //TODO: It depends from buyTokenAddress
    isBaseToken: false,
  };

  const swap = new ZeroXV2SwapRecipe(
    sellERC20Info,
    buyERC20Info,
    slippage,
    zerozk.address,
  );

  const unshieldERC20Amounts = [{ ...sellERC20Info, amount }];

  const recipeInput: any = {
    networkName: railgunNetwork,
    erc20Amounts: unshieldERC20Amounts,
    unshieldERC20Amounts,
    railgunAddress: zerozk.address,
    nfts: [],
  };

  const recipeSpin = spinner("Getting swap route from 0x...");
  // DEBUG
  // console.log(
  //   "[RECIPE INPUT]",
  //   JSON.stringify(
  //     {
  //       networkName: recipeInput.networkName,
  //       erc20Amounts: recipeInput.erc20Amounts,
  //       nfts: recipeInput.nfts,
  //       railgunAddress: recipeInput.railgunAddress,
  //     },
  //     (_k, v) => (typeof v === "bigint" ? v.toString() : v),
  //     2,
  //   ),
  // );

  const {
    crossContractCalls,
    erc20AmountRecipients,
    // nftRecipients,
    // feeERC20AmountRecipients,
    minGasLimit,
  } = await swap.getRecipeOutput(recipeInput);

  recipeSpin.succeed("Swap route found");

  const shieldERC20Addresses = erc20AmountRecipients.map(
    ({ tokenAddress }) => ({
      tokenAddress,
      recipientAddress: zerozk.address,
    }),
  );
  // const shieldERC20Addresses = erc20AmountRecipients.map(
  //   ({ tokenAddress }) => tokenAddress,
  // );

  const spin = spinner("Looking for available broadcaster...");
  const selectedBroadcaster = await findBroadcaster(
    railgunNetwork,
    WETHAddress,
  );
  if (!selectedBroadcaster) {
    spin.fail("No broadcaster available.");
    return;
  }
  spin.succeed(`Broadcaster found: ${selectedBroadcaster.railgunAddress}`);

  //TODO: Extract common code
  const feeData = await provider.getFeeData();
  const evmGasType = getEVMGasTypeForTransaction(railgunNetwork, false);
  const originalGasDetails: TransactionGasDetails =
    evmGasType === EVMGasType.Type2
      ? {
          evmGasType: EVMGasType.Type2,
          gasEstimate: 0n,
          maxFeePerGas: feeData.maxFeePerGas ?? 0n,
          maxPriorityFeePerGas: feeData.maxPriorityFeePerGas ?? 0n,
        }
      : {
          evmGasType: EVMGasType.Type1,
          gasEstimate: 0n,
          gasPrice: feeData.gasPrice ?? 0n,
        };

  const feeTokenDetails: FeeTokenDetails = {
    tokenAddress: WETHAddress,
    feePerUnitGas: BigInt(selectedBroadcaster.tokenFee.feePerUnitGas),
  };

  const gasSpin = spinner("Estimating gas...");
  const { gasEstimate } = await gasEstimateForUnprovenCrossContractCalls(
    TXIDVersion.V2_PoseidonMerkle,
    railgunNetwork,
    zerozk.id,
    zerozk.encryptionKey,
    unshieldERC20Amounts,
    [],
    shieldERC20Addresses,
    [],
    crossContractCalls,
    originalGasDetails,
    feeTokenDetails,
    false,
    minGasLimit,
  );
  gasSpin.succeed(`Gas estimated: ${gasEstimate}`);

  const broadcasterFeeERC20AmountRecipient = calcBroadcasterFee(
    selectedBroadcaster,
    feeTokenDetails,
    { ...originalGasDetails, gasEstimate },
  );
  const overallBatchMinGasPrice = calculateGasPrice({
    ...originalGasDetails,
    gasEstimate,
  });

  const proofSpin = spinner("Generating ZK proof (~5s)...");
  await generateCrossContractCallsProof(
    TXIDVersion.V2_PoseidonMerkle,
    railgunNetwork,
    zerozk.id,
    zerozk.encryptionKey,
    unshieldERC20Amounts,
    [],
    shieldERC20Addresses,
    [],
    crossContractCalls,
    broadcasterFeeERC20AmountRecipient,
    false,
    overallBatchMinGasPrice,
    minGasLimit,
    (progress: any) => {
      proofSpin.text = `Generating ZK proof... ${Math.round(progress * 100)}%`;
    },
  );
  proofSpin.succeed("ZK proof generated");

  const sendSpin = spinner("Broadcasting swap...");
  const populated = await populateProvedCrossContractCalls(
    TXIDVersion.V2_PoseidonMerkle,
    railgunNetwork,
    zerozk.id,
    unshieldERC20Amounts,
    [],
    shieldERC20Addresses,
    [],
    crossContractCalls,
    broadcasterFeeERC20AmountRecipient,
    false,
    overallBatchMinGasPrice,
    { ...originalGasDetails, gasEstimate },
  );

  await submitViaBroadcaster(
    populated,
    selectedBroadcaster,
    railgunNetwork,
    overallBatchMinGasPrice,
    true, // useRelayAdapt
  );
  sendSpin.succeed("Swap broadcasted");
  printSuccess("Private swap complete.");
}
