import { provider } from "./config";

const POLL_INTERVAL_SECONDS = 7;

export function sleep(s: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, s * 1000));
}

export async function pollUntilDeposit(eoaAddress: string): Promise<bigint> {
  console.log(`\n  Waiting for deposit in ${eoaAddress}`);

  while (true) {
    await sleep(POLL_INTERVAL_SECONDS);
    const balance = await provider.getBalance(eoaAddress);

    if (balance > 0n) {
      return balance;
    }
  }
}
