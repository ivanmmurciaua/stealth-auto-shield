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
} from "./ui/console.js";
import { initRailgunEngine } from "./init/railgun.js";
import { validateSeed, deriveAll } from "./wallet/derive.js";
import type { SupportedNetwork } from "./init/railgun.js";
import chalk from "chalk";
import { waitUntilOffline } from "./init/network.js";

export function hideAddress(address: string) {
  return address.slice(0, 4) + "..." + address.slice(-4);
}

async function main() {
  console.clear();
  printBanner();

  // ─── PHASE 1: ONLINE — INIT RAILGUN ───
  printSection("Starting RAILGUN engine");
  const walletSource = await prompt(
    "Choose a name for your RAILGUN wallet source (less than 16 characters)",
  );
  printInfo("Connecting to networks and loading ZK artifacts...");

  const spin = spinner("Initializing...");
  try {
    await initRailgunEngine(walletSource);
    spin.succeed(chalk.green("RAILGUN ready"));
  } catch (err) {
    spin.fail("Error initializing RAILGUN");
    printError(String(err));
    process.exit(1);
  }

  // ─── MANDATORY DISCONNECT INTERNET TO CONTINUE ───
  printOfflineBanner();
  await waitUntilOffline();

  // ─── PHASE 2: OFFLINE — SEED AND DERIVATION OPTIONS ───
  printSection("Wallet setup (offline mode)");
  printInfo("From here on, no network connection is made\n");

  // Network selection
  console.log(chalk.yellow("  Network:"));
  console.log("    [1] mainnet");
  console.log("    [2] sepolia");
  const netChoice = await prompt("Choose (default: sepolia)");
  const network: SupportedNetwork = netChoice === "1" ? "mainnet" : "sepolia";
  printSuccess(`Network selected: ${network}`);

  // Derivation index
  const eoaIdxRaw = await prompt("Account index (default: 0)");
  const eoaAccountIndex = eoaIdxRaw === "" ? 0 : parseInt(eoaIdxRaw, 10);

  // Seed (input oculto con contador)
  printSection("Enter your seed phrase");
  printInfo("The text is not saved to disk\n");

  const seedLength = await askSeedLength();

  let mnemonic = "";
  let attempts = 0;
  while (true) {
    mnemonic = await hiddenPrompt("Write your seed phrase", seedLength);

    if (validateSeed(mnemonic)) {
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

  // ─── Derivación ───
  printSection("Deriving keys (100% local)");

  try {
    const deriveSpin = spinner("Deriving....");
    const result = await deriveAll(mnemonic, {
      eoaAccountIndex,
      eoaAddressIndex: 0,
      network,
    });
    deriveSpin.succeed("Keys derived successfully");

    // ─── Output ───
    printSection("Result");

    console.log(chalk.cyan("\n  ── Ethereum (0x) ──"));
    console.log(
      `  ${chalk.gray("0x address:")}       ${chalk.white(result.eoa.address)}`,
    );
    console.log(
      `  ${chalk.gray("Derivation path:")}  ${chalk.white(result.eoa.derivationPath)}`,
    );
    console.log(
      `  ${chalk.gray("Account index:")}    ${chalk.white(result.eoa.nonce)}`,
    );
    console.log(
      `  ${chalk.gray("Private key:")}      ${chalk.red(hideAddress(result.eoa.privateKey))}`,
    );

    console.log(chalk.cyan("\n  ── RAILGUN (0zk) ──"));
    console.log(
      `  ${chalk.gray("0zk address:")}        ${chalk.white(hideAddress(result.railgun.zkAddress))}`,
    );
    console.log(
      `  ${chalk.gray("RAILGUN Wallet ID:")}  ${chalk.red(hideAddress(result.railgun.railgunID))}`,
    );

    console.log(
      chalk.yellow(
        "\n  ⚠️  The seed and private keys are NEVER saved to disk\n",
      ),
    );

    printSuccess("Setup complete. Ready for the next step");
    process.exit(1);
  } catch (err) {
    printError(`Error: ${String(err)}`);
    process.exit(1);
  }
}

main().catch((err) => {
  console.error(chalk.red("Fatal error:"), err);
  process.exit(1);
});
