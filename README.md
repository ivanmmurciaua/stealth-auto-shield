# 🛡️ RAILGUN CLI

Privacy CLI over Ethereum. Supports **Mainnet** and **Sepolia**.

## Setup

```bash
npm install
npm start
```

## Flow

```
[START]
    │
    ▼
[PHASE 1 · ONLINE]
    ├── Initializes RAILGUN engine
    ├── Loads ZK artifacts (prover)
    ├── Connects to Mainnet (eth.llamarpc.com / ankr)
    └── Connects to Sepolia (ankr / drpc)
    │
    ▼ RAILGUN OK
    │
[PHASE 2 · OFFLINE]  ← from here, without network
    ├── Network selection (Mainnet / Sepolia)
    ├── EOA account index
    ├── RAILGUN wallet index
    └── Seed phrase (hidden input with *)
    │
    ▼
[DERIVATION · LOCAL]
    ├── EOA   → m/44'/60'/{account}'/0/0  (Ethereum / Fluidkey)
    └── 0zk   → RAILGUN internal index
```

## Derivation Paths

| Purpose          | Path                        |
|------------------|-----------------------------|
| Standard EOA     | `m/44'/60'/0'/0/0`          |
| EOA Account 1    | `m/44'/60'/1'/0/0`          |
| RAILGUN ID       | internal SDK (index 0)     |

## Next Steps

- [ ] Shield EOA → RAILGUN
- [ ] Fluidkey stealth address from EOA
- [ ] Interactive mode with main menu
- [ ] Export viewing key for external scanning
