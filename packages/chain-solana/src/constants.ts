import { PublicKey, SYSVAR_INSTRUCTIONS_PUBKEY } from "@solana/web3.js";

export const VERIAGENT_PROGRAM_ID = new PublicKey(
  "AJirAN6RarZXyHWfYLSFB6NUCbFG3RaKDXMCDueRi7uV",
);
export const SECP256R1_PROGRAM_ID = new PublicKey(
  "Secp256r1SigVerify1111111111111111111111111",
);
export const INSTRUCTIONS_SYSVAR_ID = SYSVAR_INSTRUCTIONS_PUBKEY;
export const CHALLENGE_DOMAIN = new TextEncoder().encode("VERIAGENT_SOLANA_V1");
export const PROTOCOL_SEED = new TextEncoder().encode("protocol");
export const VAULT_SEED = new TextEncoder().encode("vault");
export const SESSION_SEED = new TextEncoder().encode("session");
export const ACTION_INITIALIZE_VAULT = 1;
export const ACTION_GRANT_SESSION = 2;
export const ACTION_TRANSFER = 3;
export const ACTION_INITIALIZE_VAULT_AND_GRANT_SESSION = 4;
export const SESSION_ACTION_TRANSFER = 1;

export const SOLANA_DEVNET_USDC_MINT = new PublicKey(
  "4zMMC9srt5Ri5X14GAgXhaHii3GnPAEERYPJgZJDncDU",
);