import { config } from "./config.js";
import {
  initFluidkeyKeys,
  precheckStealthAccount,
  generateStealthAccount,
} from "./stealth.js";
import {
  initRailgun,
  setupBalanceCallback,
  scanRailgunBalances,
  hasShieldedToRailgun,
  shieldETH,
} from "./railgun.js";
import { formatEther } from "viem";
import { pollUntilDeposit, sleep } from "./monitor.js";

async function scanRGNBalances() {
  const [spendable, pending] = await scanRailgunBalances();
  if (spendable || pending) {
    console.log(`→ Confirmed: ${formatEther(spendable)} ETH`);
    console.log(`→ Pending to shield: ${formatEther(pending)} ETH\n`);
  }
}

async function main() {
  console.clear();
  // To avoid RAILGUN level legacy error scanning balances
  const originalStderr = process.stderr.write.bind(process.stderr);
  process.stderr.write = (chunk: any, ...args: any[]) => {
    if (typeof chunk === "string" && chunk.includes("LEVEL_LEGACY"))
      return true;
    return originalStderr(chunk, ...args);
  };

  console.log("");
  console.log(
    "╔══════════════════════════════════════════════════════════════════════╗",
  );
  console.log(
    "║                 Fluidkey DKSAP + RAILGUN auto-shield                 ║",
  );
  console.log(
    "║                                                                      ║",
  );
  console.log(
    "║       Creates stealth EOAs for deposits. Once ETH is detected,       ║",
  );
  console.log(
    "║     it's automatically shielded, preserving input-output format.     ║",
  );
  console.log(
    "║                                                                      ║",
  );
  console.log(
    "║                     Created by ivanmmurcia.eth                       ║",
  );
  console.log(
    "╚══════════════════════════════════════════════════════════════════════╝",
  );
  console.log("");

  console.log(`Configuration params:`);
  console.log(`Network: ${config.networkStr}`);
  console.log(`Poll interval: ${config.pollIntervalSeconds}s\n`);

  setupBalanceCallback();
  await initRailgun();
  await scanRGNBalances();

  const fluidkeyKeys = await initFluidkeyKeys();
  let nonce = parseInt(config.nonce);

  console.log("Looking for a usable stealth address...");
  while (true) {
    const account = await generateStealthAccount(fluidkeyKeys, nonce);
    await sleep(3); // Avoid 429

    const [balance, shielded] = await Promise.all([
      precheckStealthAccount(account),
      hasShieldedToRailgun(account.stealthEOAAddress),
    ]);

    // === Uncomment this for better debug ===
    // console.log(`Stealth EOA ${nonce}: ${account.stealthEOAAddress}`);
    // console.log(`Signer key ${nonce}: ${account.stealthEOAPrivateKey}`);
    // console.log(`ETH balance: ${formatEther(balance)} ETH\n`);

    if (shielded) {
      // console.log(`#${nonce} EOA already used → NEXT`);
      nonce++;
      continue;
    }

    if (balance === 0n) {
      console.log("\nNew fresh stealth EOA found");
      const depositedBalance = await pollUntilDeposit(
        account.stealthEOAAddress,
      );
      console.log("");
      await shieldETH(
        account.stealthEOAPrivateKey,
        depositedBalance,
        account.stealthEOAAddress,
      );
      await scanRGNBalances();
      break;
    }

    // balance > 0 && not shielded yet
    console.log(`#${nonce} has ${formatEther(balance)} ETH → Shielding...`);
    console.log("");
    await shieldETH(
      account.stealthEOAPrivateKey,
      balance,
      account.stealthEOAAddress,
    );
    await scanRGNBalances();
    break;
  }
  process.exit(0);
}

main().catch((err) => {
  console.error(`Fatal error: ${err.message}`);
  console.error(err);
  process.exit(1);
});
