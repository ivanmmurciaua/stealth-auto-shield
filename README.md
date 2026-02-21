# 🛡️ RAILGUN CLI

CLI de privacidad sobre Ethereum. Soporta **Mainnet** y **Sepolia**.

## Setup

```bash
npm install
npm start
```

## Flujo

```
[ARRANQUE]
    │
    ▼
[FASE 1 · ONLINE]
    ├── Inicializa RAILGUN engine
    ├── Carga artefactos ZK (prover)
    ├── Conecta Mainnet (eth.llamarpc.com / ankr)
    └── Conecta Sepolia (ankr / drpc)
    │
    ▼ RAILGUN OK
    │
[FASE 2 · OFFLINE]  ← a partir de aquí, sin red
    ├── Selección de red (Mainnet / Sepolia)
    ├── Account index EOA
    ├── Index RAILGUN wallet
    └── Seed phrase (input oculto con *)
    │
    ▼
[DERIVACIÓN · LOCAL]
    ├── EOA   → m/44'/60'/{account}'/0/0  (Ethereum / Fluidkey)
    └── 0zk   → RAILGUN internal index
```

## Paths de derivación

| Propósito | Path |
|-----------|------|
| EOA estándar | `m/44'/60'/0'/0/0` |
| EOA cuenta 1 | `m/44'/60'/1'/0/0` |
| RAILGUN ID | interno SDK (index 0) |

## Próximos pasos

- [ ] Shield EOA → RAILGUN
- [ ] Fluidkey stealth address desde EOA
- [ ] Modo interactivo con menú principal
- [ ] Exportar viewing key para escaneo externo
