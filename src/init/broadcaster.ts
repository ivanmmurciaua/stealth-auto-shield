import {
  NETWORK_CONFIG,
  type NetworkName,
  type SelectedBroadcaster,
  type FeeTokenDetails,
  type TransactionGasDetails,
  RailgunPopulateTransactionResponse,
} from "@railgun-community/shared-models";
import { calculateBroadcasterFeeERC20Amount } from "@railgun-community/wallet";
import {
  BroadcasterFeeConfig,
  EthereumAddress,
  RailgunAddress,
} from "../utils/types";

const wakuModule = import("@railgun-community/waku-broadcaster-client-node");

let WakuBroadcasterClient: any;
let BroadcasterTransaction: any;
let waku: any;

export const initializeBroadcasters = async (network: NetworkName) => {
  if (!waku) {
    waku = await wakuModule;
  }
  WakuBroadcasterClient = waku.WakuBroadcasterClient;
  BroadcasterTransaction = waku.BroadcasterTransaction;

  const { chain } = NETWORK_CONFIG[network];

  return new Promise<void>((resolve) => {
    const callback = (chain: any, status: any) => {
      if (status === "Connected") {
        // console.log(`WAKU ${chain.id}:${chain.type} ${status}`);
        resolve();
      }
    };
    const debugLogger = {
      log: (msg: string) => {
        // process.stdout.write(`  ${msg}\n`);
      },

      error: (error: Error) => console.error(error),
    };

    WakuBroadcasterClient.start(chain, {}, callback, debugLogger);
  });
};

export async function findBroadcaster(
  network: NetworkName,
  tokenAddress: string,
): Promise<SelectedBroadcaster | undefined> {
  const { chain } = NETWORK_CONFIG[network];

  // // DEBUG
  // const all = await WakuBroadcasterClient.findAllBroadcastersForChain(chain);
  // console.log("[DEBUG] all broadcasters:", JSON.stringify(all, null, 2));

  await WakuBroadcasterClient.findAllBroadcastersForChain(chain);
  const selectedBroadcaster: SelectedBroadcaster =
    await WakuBroadcasterClient.findBestBroadcaster(chain, tokenAddress);
  // console.log(selectedBroadcaster);
  return selectedBroadcaster;
}

export function calcBroadcasterFee(
  selectedBroadcaster: SelectedBroadcaster,
  feeTokenDetails: FeeTokenDetails,
  estimatedGasDetails: TransactionGasDetails,
): BroadcasterFeeConfig {
  const fee = calculateBroadcasterFeeERC20Amount(
    feeTokenDetails,
    estimatedGasDetails,
  );
  //TODO: Type ethaddress and rgnaddress. Change every Ethereum & Railgun address
  return {
    tokenAddress: fee.tokenAddress as EthereumAddress,
    amount: fee.amount,
    recipientAddress: selectedBroadcaster.railgunAddress as RailgunAddress,
  };
}

export async function submitViaBroadcaster(
  populateResponse: RailgunPopulateTransactionResponse,
  selectedBroadcaster: SelectedBroadcaster,
  network: NetworkName,
  overallBatchMinGasPrice: bigint,
  useRelayAdapt: boolean = false,
): Promise<string> {
  const { chain } = NETWORK_CONFIG[network];
  const nullifiers: string[] = populateResponse.nullifiers ?? [];

  const broadcasterTransaction = await BroadcasterTransaction.create(
    "V2_PoseidonMerkle",
    populateResponse.transaction.to,
    populateResponse.transaction.data,
    selectedBroadcaster.railgunAddress,
    selectedBroadcaster.tokenFee.feesID,
    chain,
    nullifiers,
    overallBatchMinGasPrice,
    useRelayAdapt,
    populateResponse.preTransactionPOIsPerTxidLeafPerList ?? {},
  );

  try {
    return await broadcasterTransaction.send();
  } catch (err: any) {
    console.log("[BROADCASTER ERROR] message:", err.message);
    console.log("[BROADCASTER ERROR] full:", JSON.stringify(err, null, 2));
    throw err;
  }
}

export const getBroadcasterFeeInfo = async (
  network: NetworkName,
  tokenAddress: string,
): Promise<SelectedBroadcaster> => {
  const { chain } = NETWORK_CONFIG[network];
  return await WakuBroadcasterClient.findBestBroadcaster(
    chain,
    tokenAddress,
    true,
  );
};

export const getBroadcasterFeeRecipientDetails = async (
  selectedBroadcaster: SelectedBroadcaster,
  estimatedGasDetails: TransactionGasDetails,
  feeTokenDetails: FeeTokenDetails,
) => {
  const broadcasterFeeAmountDetails = calculateBroadcasterFeeERC20Amount(
    feeTokenDetails,
    estimatedGasDetails,
  );

  const broadcasterFeeERC20AmountRecipient = {
    tokenAddress: broadcasterFeeAmountDetails.tokenAddress,
    amount: broadcasterFeeAmountDetails.amount,
    recipientAddress: selectedBroadcaster.railgunAddress,
  };

  return broadcasterFeeERC20AmountRecipient;
};
