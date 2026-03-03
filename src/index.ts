// UI
import {
  printBanner,
  printSection,
  printSuccess,
  printError,
  printInfo,
  hiddenPrompt,
  prompt,
  spinner,
  printOfflineBanner,
  askSeedLength,
  printOnlineBanner,
} from "./ui/console.js";
import chalk from "chalk";

// RAILGUN
import {
  initRailgunEngine,
  privateSwap,
  privateTransferETH,
  scanRailgunBalances,
  setupBalanceCallback,
  shieldETH,
  unshieldETH,
} from "./init/railgun.js";
import { initializeBroadcasters } from "./init/broadcaster.js";

// WALLET
import {
  validateSeed,
  deriveRailgun,
  getEphemeralEOA,
} from "./wallet/derive.js";

// CONFIG
import { waitUntil } from "./init/network.js";
import { pollUntilDeposit } from "./utils/monitor.js";
import {
  avoidRailgunErrors,
  avoidRailgunScanningErrors,
  clear,
  hideAddress,
  network,
  provider,
  railgunNetwork,
  setNetwork,
  setProvider,
  TOKEN_DECIMALS,
  TOKEN_SYMBOLS,
} from "./utils/config.js";

// TYPES
import {
  AccountIndex,
  DerivedEOA,
  DerivedRailgun,
  EthereumAddress,
  RailgunAddress,
  SupportedNetwork,
} from "./utils/types.js";

// import { initFluidkeyKeys } from "./stealth.js";

import { formatEther, formatUnits, parseEther } from "viem";
//TODO: Extract this
import { NETWORK_CONFIG } from "@railgun-community/shared-models";

// Wallets
let eoa: DerivedEOA;
let railgun: DerivedRailgun;

async function stealthOption(): Promise<boolean> {
  console.log("");
  console.log(chalk.yellow("  Do you want to use stealth addresses?"));
  console.log("    [1] Yes");
  console.log("    [2] Nop");
  let stealthChoice = await prompt("Choose (default: Nop)");
  return stealthChoice === "1" ? true : false;
}

async function networkSelection(): Promise<SupportedNetwork> {
  let network: SupportedNetwork = "sepolia";

  console.log(chalk.yellow("  Network:"));
  console.log("    [1] mainnet");
  console.log("    [2] sepolia");
  console.log("    [3] arbitrum");
  const netChoice = await prompt("Choose (default: sepolia)");

  switch (netChoice) {
    case "1":
      network = "mainnet";
      break;
    case "2":
      network = "sepolia";
      break;
    case "3":
      network = "arbitrum";
      break;
    default:
      network = "sepolia";
  }

  // Set global config
  setNetwork(network);
  setProvider(network);

  printSuccess(`Network selected: ${network}`);
  return network;
}

async function showRailgunBalances(): Promise<void> {
  const spin = spinner("Checking RAILGUN balances...");
  const balances = await scanRailgunBalances(railgun.id);
  spin.stop();

  const { baseToken } = NETWORK_CONFIG[railgunNetwork];

  console.log(chalk.cyan("\n  ── RAILGUN Balances ──"));

  const entries = Object.entries(balances);
  if (entries.length === 0) {
    console.log(
      chalk.gray(
        "\n  * If balances seem incorrect, rescan using option [1] from the main menu.",
      ),
    );
    console.log(`  ${chalk.gray("No balances found")}`);
    return;
  }

  for (const [token, { spendable, pending }] of entries) {
    // const isWrapped = token === baseToken.wrappedAddress.toLowerCase();
    const symbol = TOKEN_SYMBOLS[token] ?? token.slice(0, 6) + "...";
    const decimals = TOKEN_DECIMALS[token] ?? 18;

    console.log(`  ${chalk.cyan(symbol)}`);
    console.log(
      `    ${chalk.gray("Spendable:")}  ${chalk.green(formatUnits(spendable, decimals))}`,
    );
    console.log(
      `    ${chalk.gray("Pending:")}    ${chalk.yellow(formatUnits(pending, decimals))}`,
    );
  }
}

async function menu(seed: string, railgun: DerivedRailgun) {
  while (true) {
    console.log(chalk.cyan("\n  ── Menu ──"));
    console.log("    [0] Exit");
    console.log("    [1} Reescan balances");
    console.log("    [2] Ephemeral deposit");
    console.log("    [3] Transfer");
    console.log("    [4] Unshield");
    console.log("    [5] Swap");

    const choice = await prompt("Choose an option");

    switch (choice) {
      case "1":
        await showRailgunBalances();
        break;
      case "2":
        await handleEphemeralDeposit(seed, railgun.address);
        break;
      case "3":
        await handleTransfer(railgun, eoa);
        break;
      case "4":
        await handleUnshield(railgun, seed);
        break;
      case "5":
        await handleSwap(railgun);
        break;
      case "0":
        console.log(chalk.yellow("\n  Goodbye\n"));
        process.exit(0);
      default:
        printError("Invalid option. Try again.");
    }
  }
}

async function handleEphemeralDeposit(
  seed: string,
  railgunAddress: `0zk${string}`,
): Promise<void> {
  printSection("Ephemeral Deposit (0x → 0zk)");

  const stealthChoice = await stealthOption();

  if (stealthChoice) {
    // let stealthIndex = 0;
    // eoa = generateStealth();
    console.log("Stealth crazy sh*t will appear here soon...");
    process.exit(0);
  } else {
    eoa = await getEphemeralEOA(seed, AccountIndex.deposit);
  }

  let balance = await provider.getBalance(eoa.address);
  if (balance === 0n) {
    printInfo(`No funds yet. Waiting for deposit...`);
    balance = await pollUntilDeposit(eoa.address);
  }

  printSuccess(`\nBalance detected: ${formatEther(balance)} ETH`);
  await shieldETH(eoa, railgunAddress, balance);
}

async function handleTransfer(
  railgun: DerivedRailgun,
  eoa: DerivedEOA, //TODO: If dont want to use broadcaster
): Promise<void> {
  printSection("Private Transfer (0zk → 0zk)");

  // Init broadcasters (Waku)
  const wakuSpin = spinner("Connecting to broadcaster network (Waku)...");
  try {
    await initializeBroadcasters(railgunNetwork);
    wakuSpin.succeed(chalk.green("Broadcaster network ready"));

    const toAddress = (await prompt("Recipient 0zk address")) as RailgunAddress;
    const amountEth = await prompt("Amount ETH to transfer");
    const amountWei = parseEther(amountEth);
    // const memo = await prompt("Memo (optional, press Enter to skip)");

    await privateTransferETH(railgun, toAddress, amountWei);
  } catch (err) {
    wakuSpin.fail("Could not connect to broadcaster network");
    printError(String(err));
    process.exit(1);
  }
}

async function handleUnshield(
  railgun: DerivedRailgun,
  seed: string,
): Promise<void> {
  printSection("Unshield (0zk → 0x)");
  const wakuSpin = spinner("Connecting to broadcaster network (Waku)...");
  try {
    await initializeBroadcasters(railgunNetwork);
    wakuSpin.succeed(chalk.green("Broadcaster network ready"));

    const depositEOA = await getEphemeralEOA(seed, AccountIndex.receive);
    printInfo(`Destination address: ${depositEOA.address}`);
    printInfo(
      `You can extract funds importing this private key into your wallet: ${chalk.red(depositEOA.privateKey)}`,
    );
    console.log("");
    const amountEth = await prompt("Amount ETH to unshield");
    const amount = parseEther(amountEth);
    //TODO: depositEOA.privateKey -> if dont want to use broadcaster
    await unshieldETH(railgun, depositEOA.address, amount);
  } catch (err) {
    wakuSpin.fail("Could not connect to broadcaster network");
    printError(String(err));
    process.exit(1);
  }
}

async function handleSwap(railgun: DerivedRailgun) {
  if (network === "sepolia") {
    printError("Swap not available on Sepolia. Use other network.");
    return;
  }

  printSection("Private Swap (0zk → 0zk)");
  const wakuSpin = spinner("Connecting to broadcaster network (Waku)...");
  //TODO: Extract waku initializer and import it in all fxs
  try {
    await initializeBroadcasters(railgunNetwork);
    wakuSpin.succeed(chalk.green("Broadcaster network ready"));
    console.log("");
    //TODO: Improve this and:
    //  1. Add selector in buyToken
    //  2. Add sellToken with selector and balances
    printError(
      "Sell token must be RAILGUN ETH. Other tokens as sell input are not yet supported.",
    );
    const buyToken = (await prompt(
      "Buy token address (For USDC in Arbitrum use: 0xaf88d065e77c8cc2239327c5edb3a432268e5831)",
    )) as EthereumAddress;
    const amountEth = await prompt("Amount ETH to sell");
    const amount = parseEther(amountEth);
    await privateSwap(railgun, buyToken, amount);
  } catch (err) {
    wakuSpin.fail("Could not connect to broadcaster network");
    printError(String(err));
    process.exit(1);
  }
}
async function main() {
  clear();
  avoidRailgunScanningErrors();
  avoidRailgunErrors();
  printBanner();
  await networkSelection();

  // ─── PHASE 1: ONLINE — INIT RAILGUN ───
  printSection("Starting RAILGUN engine");
  printInfo("Connecting to networks and loading ZK artifacts...");

  const spin = spinner("Initializing...");
  try {
    await initRailgunEngine();
    spin.succeed(chalk.green("RAILGUN ready"));
  } catch (err) {
    spin.fail("Error initializing RAILGUN");
    printError(String(err));
    process.exit(1);
  }

  // ─── MANDATORY DISCONNECT INTERNET TO CONTINUE ───
  printOfflineBanner();
  await waitUntil({ type: "offline" });

  // ─── PHASE 2: OFFLINE — SEED AND DERIVATION OPTIONS ───
  printSection("Wallet setup (offline mode)");
  printInfo("From here on, no network connection is made\n");

  // Hidden input
  printSection("Enter your seed phrase");
  printInfo("The text is not saved to disk\n");

  const seedLength = await askSeedLength();

  let seed = "";
  let attempts = 0;
  while (true) {
    seed = await hiddenPrompt("Write your seed phrase", seedLength);

    if (validateSeed(seed)) {
      printSuccess("Valid seed");
      break;
    }

    attempts++;
    printError("Invalid seed. Please check the words and try again");
    if (attempts >= 3) {
      printError("Too many failed attempts. Exiting");
      process.exit(1);
    }
  }

  printSection("Deriving keys (100% local)");

  try {
    const deriveSpin = spinner("Deriving....");
    railgun = await deriveRailgun(seed);
    deriveSpin.succeed("Keys derived successfully");
    console.log(chalk.cyan("\n  ── RAILGUN (0zk) ──"));
    console.log(
      `  ${chalk.gray("0zk address:")}        ${chalk.white(hideAddress(railgun.address))}`,
    );
    console.log(
      `  ${chalk.gray("RAILGUN Wallet ID:")}  ${chalk.red(hideAddress(railgun.id))}`,
    );

    console.log(
      chalk.yellow(
        "\n  ⚠️  The seed and private keys are NEVER saved to disk\n",
      ),
    );

    printOnlineBanner();
    await waitUntil({ type: "online" });

    clear();

    // Setup balance callback
    setupBalanceCallback();
    await showRailgunBalances();

    // === MAIN MENU ===
    await menu(seed, railgun);
  } catch (err) {
    printError(`Error: ${String(err)}`);
    process.exit(1);
  }
}

main().catch((err) => {
  console.error(chalk.red("Fatal error:"), err);
  process.exit(1);
});
