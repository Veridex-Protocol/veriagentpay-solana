# Upstream Reconciliation Map

This capsule intentionally has no runtime or build dependency on its parent
repository. The following files are behavioral references for post-hackathon
reconciliation, not imported source:

| Capsule area | Existing repository reference |
| --- | --- |
| Passkey authorization and session policy | `contracts/src/PayVault.sol`, `contracts/src/SessionRegistry.sol`, `contracts/src/SpendingLimitModule.sol` |
| Social escrow and envelopes | `contracts/src/SocialPayments.sol` |
| Group lending | `contracts/src/GroupLendingPool.sol` |
| WebAuthn ceremonies | `backend/src/identity/webauthn.service.ts` |
| Transaction preparation | `backend/src/relayer/passkey-execution.service.ts` |
| Telegram intent routing | `backend/src/platform/platform.service.ts` |
| Transaction UX | `frontend/src/lib/passkey-actions.ts`, `frontend/src/app/send/page.tsx` |

When merging back, move byte-identical packages under `packages/` first. Then
register Solana-specific implementations behind chain ports before changing the
existing BOTChain behavior.