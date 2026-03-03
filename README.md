# 🛡️ RAILGUN CLI 🛡️
Privacy CLI over Ethereum. Supports **Mainnet** and **Sepolia** (also **Arbitrum**).

> Public RPCs working!

## ⚠️ Beta Warning

This software is in beta. Use at your own risk.

**Your funds are always recoverable.** RAILGUN is a non-custodial protocol — your private balance is derived from your seed phrase and lives on-chain. If anything goes wrong with this CLI, you can always access and recover your funds by importing the same seed phrase into [Railway Wallet](https://railway.xyz/), the official RAILGUN wallet interface.

> Never share your seed phrase with anyone. This CLI never stores it, but you are responsible for keeping it safe.

## What it does

From a single seed phrase, the CLI derives a standard Ethereum EOA and a RAILGUN private wallet (0zk address). Once funds enter RAILGUN via a Shield, all subsequent operations are opaque on-chain: no one can see the origin, destination, or amount.

Supported operations: Shield, private Transfer between 0zk addresses, private Swap via 0x DEX, and Unshield back to a public address. All operations except Shield are routed through the Waku network via anonymous broadcasters, which pay gas on-chain in exchange for a small fee in private tokens.

The seed is entered **offline** and never written to disk. ZK artifacts, the merkle tree, and wallet state are stored locally. No backend, no custodian, no server sees anything.

## Setup

```bash
cp .env.example .env
npm install
npm start
```

## ENV Config

```env
SEPOLIA_RPC_URL_1=https://ethereum-sepolia-rpc.publicnode.com
SEPOLIA_RPC_URL_2=https://0xrpc.io/sep
MAINNET_RPC_URL_1=https://eth.llamarpc.com
MAINNET_RPC_URL_2=https://rpc.ankr.com/eth
ARBITRUM_RPC_URL_1=https://arbitrum.drpc.org
ARBITRUM_RPC_URL_2=https://arbitrum-one-rpc.publicnode.com
# Optional: required for private swaps via 0x
ZEROX_API_KEY=<YOUR_ZEROX_API_KEY>
```

> Get a free 0x API key at [dashboard.0x.org](https://dashboard.0x.org).
> Public RPC URLs are provided as defaults but may be rate-limited. Consider using a private RPC for production use.

## Private Swap fee breakdown example (Arbitrum Network)

Rate: 1 ETH -> 1948.5721926 USDC
Swap: 0.003 ETH → USDC
CoinMarketCap: 0.003 ETH -> 5.85347528 USDC

| Concept | Rate | Amount |
|---|---|---|
| Market rate | — | 5.8534 USDC |
| RAILGUN unshield fee | 0.25% | -0.0146 USDC |
| 0x protocol fee | 0.15% | -0.0088 USDC |
| Slippage (real) | ~0.25% | -0.0146 USDC |
| RAILGUN shield fee | 0.25% | -0.0146 USDC |
| **Received** | **~0.81% total** | **5.8058 USDC** |

> All operations routed through anonymous Broadcaster. No public address linked to the swap.

## Next Steps

### Private DeFi (coming soon)

> If you are interested in this, follow the project or open an issue.
