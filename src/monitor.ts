import { JsonRpcProvider } from "ethers";
import { config } from "./config.js";

export function sleep(s: number) {
  return new Promise((resolve) => setTimeout(resolve, s * 1000));
}

export async function pollUntilDeposit(eoaAddress: string): Promise<bigint> {
  const provider = new JsonRpcProvider(config.rpcUrl);

  console.log(`Waiting for deposits in ${eoaAddress} ...`);

  while (true) {
    await sleep(config.pollIntervalSeconds);
    const balance = await provider.getBalance(eoaAddress);

    if (balance > 0n) {
      console.log(`Deposit detected!`);
      console.log(`${balance} wei`);
      return balance;
    }

    // console.log(`No funds yet... (${new Date().toISOString()})`);
  }
}
