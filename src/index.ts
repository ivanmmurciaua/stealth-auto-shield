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
  railgunTransfer,
  railgunUnshield,
  scanRailgunBalances,
  setupBalanceCallback,
  shieldETH,
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
  provider,
  railgunNetwork,
  setNetwork,
  setProvider,
} from "./utils/config.js";

// TYPES
import {
  AccountIndex,
  DerivedEOA,
  DerivedRailgun,
  RailgunAddress,
  SupportedNetwork,
} from "./utils/types.js";

// import { initFluidkeyKeys } from "./stealth.js";

import { formatEther, parseEther } from "viem";

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
  console.log(chalk.yellow("  Network:"));
  console.log("    [1] mainnet");
  console.log("    [2] sepolia");
  const netChoice = await prompt("Choose (default: sepolia)");
  const network: SupportedNetwork = netChoice === "1" ? "mainnet" : "sepolia";

  // Set global config
  setNetwork(network);
  setProvider(network);

  printSuccess(`Network selected: ${network}`);
  return network;
}

async function showRailgunBalances(): Promise<void> {
  const spin = spinner("Checking RAILGUN balances...");
  const [spendable, pending] = await scanRailgunBalances(railgun.id);
  spin.stop();

  console.log(chalk.cyan("\n  ── RAILGUN Balances ──"));
  console.log(
    `  ${chalk.gray("Spendable:")}  ${chalk.green(formatEther(spendable))} ETH`,
  );
  console.log(
    `  ${chalk.gray("Pending:")}    ${chalk.yellow(formatEther(pending))} ETH`,
  );
}

async function menu(seed: string, railgun: DerivedRailgun) {
  while (true) {
    console.log(chalk.cyan("\n  ── Menu ──"));
    console.log("    [0] Exit");
    console.log("    [1] Ephemeral deposit");
    console.log("    [2] Transfer");
    console.log("    [3] Unshield");
    // console.log("    [4] Swap");

    const choice = await prompt("Choose an option");

    switch (choice) {
      case "1":
        await handleEphemeralDeposit(seed, railgun.address);
        break;
      case "2":
        await handleTransfer(railgun, eoa);
        break;
      case "3":
        await handleUnshield(railgun, seed);
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

    await railgunTransfer(railgun, toAddress, amountWei);
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
    await railgunUnshield(railgun, depositEOA.address, amount);
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
