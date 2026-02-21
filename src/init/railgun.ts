// import { SnarkJSGroth16 } from "@railgun-community/engine";
import {
  startRailgunEngine,
  stopRailgunEngine,
  // getProver,
  setLoggers,
  ArtifactStore,
} from "@railgun-community/wallet";
import {
  FallbackProviderJsonConfig,
  NetworkName,
} from "@railgun-community/shared-models";
import { printSuccess, printInfo, printError } from "../ui/console.js";
import { Level } from "level";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

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

export type SupportedNetwork = "mainnet" | "sepolia";

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
  //     { provider: "https://eth.llamarpc.com", priority: 1, weight: 2 },
  //     { provider: "https://rpc.ankr.com/eth", priority: 2, weight: 2 },
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

  // return { mainnet, sepolia };
  return { sepolia };
}

/**
 * Initializes the RAILGUN engine.
 * Loads ZK artifacts (prover) and connects providers.
 *
 * Requires internet. Called when starting the CLI, without seed.
 */
export async function initRailgunEngine(walletSource: string): Promise<void> {
  setLoggers(
    (msg: string) => printInfo(`[RAILGUN] ${msg}`),
    (err: string) => printError(`[RAILGUN ERR] ${err}`),
  );

  const providers = buildProviders();

  // LevelDB
  fs.mkdirSync(path.dirname(DB_PATH), { recursive: true });
  const db = new Level(DB_PATH);
  printInfo(`DB: ${DB_PATH}`);

  // ArtifactStore with cache
  const artifactStore = createArtifactStore(ARTIFACTS_DIR);
  printInfo(`Artifacts: ${ARTIFACTS_DIR}`);

  await startRailgunEngine(
    walletSource,
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
  // loadProvider (mainnet)

  // Sepolia
  await loadProvider(
    {
      chainId: providers.sepolia.chainId,
      providers: providers.sepolia.providers,
    },
    NetworkName.EthereumSepolia,
  );
  // printSuccess(`Red cargada: Sepolia (chainId 11155111)`);
}
