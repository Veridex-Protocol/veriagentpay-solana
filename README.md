# VeriAgent Pay for Solana

Standalone Solana edition of VeriAgent Pay. This directory is intentionally
self-contained so it can be copied to a new repository without retaining a
dependency on the parent monorepo.

## Current implementation

- `frontend/` is the complete VeriAgent Pay frontend, including all existing
  product routes and the published `@veridex/sdk` passkey integration.
- `backend/` is the complete NestJS application and its authoritative Prisma
  schema, with Solana account, USDC, balance, deposit, and relayer adapters.
- `contracts/anchor/` contains the native passkey vault and bounded-session
  program.
- `packages/chain-solana/` contains the shared challenge, instruction, P-256,
  and account codecs used by the frontend and backend.
- `packages/bigint-buffer/` is the existing bounds-safe dependency shim.
- `scripts/check-standalone.ts` rejects source dependencies outside this
  directory.

## Commands

```bash
bun install --frozen-lockfile
bun run verify
```

## Devnet deployment

The verified deployment is recorded in `deployments/devnet.json`.

- Program: `AJirAN6RarZXyHWfYLSFB6NUCbFG3RaKDXMCDueRi7uV`
- Protocol config: `EyxAvRRVSL8gsrsHNBAZ5aymttzZuW2QUQwE9bm5fUWW`
- Native devnet USDC: `4zMMC9srt5Ri5X14GAgXhaHii3GnPAEERYPJgZJDncDU`

Builds use official SBF platform-tools `v1.57` because current transitive Rust
dependencies require a newer compiler than the one bundled with Solana CLI
2.2.1:

```bash
bun run contracts:build:sbf
SOLANA_DEPLOYER_KEYPAIR=.keys/devnet-deployer.json \
  RP_ID=veriagentpay.xyz \
  WEBAUTHN_ORIGIN=https://veriagentpay.xyz \
  bun run protocol:initialize:devnet
```

Deployment and fee-payer keypairs remain under the ignored `.keys/` and
`contracts/anchor/target/` directories. They are never committed.