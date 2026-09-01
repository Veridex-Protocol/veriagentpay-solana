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