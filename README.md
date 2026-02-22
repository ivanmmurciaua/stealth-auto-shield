# Fluidkey DKSAP + RAILGUN auto-shield

**Containerized, self-custodial. Everything runs locally. Keys never leave your machine**

## Flow

```
Seed (.env)
  │
  ├─→ EOA (m/44'/60'/0'/0/0)
  │     └─→ sign Fluidkey message + PIN
  │           └─→ spending key + viewing key
  │                 └─→ N stealth EOAs  ← share these to receive payments
  │
  └─→ RAILGUN wallet (same seed, different path)
            └─→ 0zk address  ← final private destination

When ETH arrives at any stealth address:
  stealth EOA → sign shield tx → RAILGUN contract → 0zk balance
```

## Setup

```bash
# Clone this repo
git clone git@github.com:ivanmmurciaua/stealth-auto-shield.git

# Copy and edit config
cp .env.example .env
# Edit .env: SEED, FLUIDKEY_PIN, RPC_URL, ETHERSCAN_API_KEY, RAILGUN_DB_PASSWORD

# Start
docker compose up --build -d && clear && docker compose logs -f
```

## Recovery using SARA
SARA is a tool developed by Fluidkey team to recover your funds without relying in official apps.

All public funds are independently recoverable:
1. Go to [SARA](https://recovery.fluidkey.com/) website **OR** clone [this repository](git@github.com:ivanmmurciaua/sara.git) and execute `yarn && yarn dev`
2. Connect the same wallet (or use the seed)
3. Enter the same PIN
4. Select `Disabled` in auto-earn profile menu and import _Signer Key_ of each stealth address into your wallet
7. Recover your ETH

## .env reference

| Variable | Description |
|---|---|
| `SEED` | 12 words — source of truth for everything |
| `FLUIDKEY_PIN` | PIN the same as in the Fluidkey app |
| `RPC_URL` | Alchemy/Infura endpoint. You can obtain one for free. |
| `ETHERSCAN_API_KEY` | Etherscan API Key. You can obtain one for free. |
| `RAILGUN_DB_PASSWORD` | Local password to encrypt the LevelDB |
| `NETWORK` | `ethereum` \| `sepolia` \| `polygon` (default: sepolia)|
| `POLL_INTERVAL_SECONDS` | Check frequency (default: 15) |
| `STARTING_NONCE` | You can skip used stealth EOAs (default: 0) |
| `RAILGUN_WALLET_ID` | Auto-generated on the first startup |

## File Architecture

```
src/
  config.ts   — loads and validates the .env
  index.ts    — entrypoint, orchestrates the boot
  monitor.ts  — polling loop
  railgun.ts  — RAILGUN engine init + shield function
  stealth.ts  — Fluidkey's stealth addresses derivation
```
