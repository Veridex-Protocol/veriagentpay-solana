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

## Docker Compose

The root `Dockerfile` has separate `frontend` and `backend` targets. The
Compose stack adds PostgreSQL, Redis, an idempotent Prisma migration job,
health checks, persistent volumes, resource limits, and a file-mounted Solana
fee-payer secret.

```bash
cp .env.docker.example .env.docker
# Fill every blank secret and make DATABASE_URL/REDIS_URL match their passwords.
docker compose --env-file .env.docker build
docker compose --env-file .env.docker up -d
docker compose --env-file .env.docker ps
```

The frontend is available at `http://127.0.0.1:3000` and proxies `/api` to the
backend. The API is also bound to `http://127.0.0.1:4000` for local diagnostics.
PostgreSQL and Redis are reachable only on the internal Compose network.

This stack defaults the backend to a development runtime while targeting the
deployed devnet program. That is deliberate: dormant services copied from the
EVM application still enforce EVM production KMS/oracle configuration during
startup. Set `BACKEND_NODE_ENV=production` only after supplying those production
controls or removing the remaining EVM startup providers. WebAuthn transactions
also require serving the frontend over HTTPS at `veriagentpay.xyz`, because that
RP ID and origin are immutable in the initialized devnet protocol config.

Use a dedicated funded runtime fee payer at
`SOLANA_FEE_PAYER_KEYPAIR_FILE`; do not mount the program upgrade-authority key
into the application container.

### Dev tunnel profile

The default devnet deployment remains bound to `veriagentpay.xyz` for AWS. A
separate deployment in `deployments/devnet-tunnel.json` is bound to the current
VS Code Dev Tunnel so WebAuthn can be tested from a phone:

- Origin: `https://1pm4tfwd-3000.brs.devtunnels.ms`
- Program: `HYnWswyU79GMX6s4kYDGBa6qQGc5JiJL9rQw37Q6bZJi`
- Protocol config: `sUKnTHhGzr86wbwddVvePt229pnCev7kj5DopaXJAuZ`

Run the tunnel profile as a Compose overlay:

```bash
docker compose \
  --env-file .env.docker \
  -f docker-compose.yml \
  -f docker-compose.tunnel.yml \
  up -d --build
```

The ignored `frontend/.env.development.local` applies the same tunnel RP ID to
`bun run dev`. Configure the backend with the tunnel manifest's program ID,
`RP_ID`, and `WEBAUTHN_ORIGINS` when running it outside Compose. If the Dev
Tunnel hostname changes, deploy another program/config pair; an initialized
protocol config cannot safely switch WebAuthn origins in place.