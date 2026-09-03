use anchor_lang::prelude::*;

pub const PROTOCOL_SEED: &[u8] = b"protocol";
pub const VAULT_SEED: &[u8] = b"vault";
pub const SESSION_SEED: &[u8] = b"session";
pub const CLAIM_AUTHORITY_SEED: &[u8] = b"claim_authority";
pub const PAYMENT_LINK_SEED: &[u8] = b"payment_link";
pub const CHALLENGE_DOMAIN: &[u8] = b"VERIAGENT_SOLANA_V1";

pub const ACTION_INITIALIZE_VAULT: u8 = 1;
pub const ACTION_GRANT_SESSION: u8 = 2;
pub const ACTION_TRANSFER: u8 = 3;
pub const ACTION_INITIALIZE_VAULT_AND_GRANT_SESSION: u8 = 4;

pub const SESSION_ACTION_TRANSFER: u16 = 1 << 0;
pub const SUPPORTED_SESSION_ACTIONS: u16 = SESSION_ACTION_TRANSFER;
pub const MAX_SESSION_DURATION_SECONDS: i64 = 30 * 24 * 60 * 60;
pub const MAX_PAYMENT_LINK_DURATION_SECONDS: i64 = 30 * 24 * 60 * 60;
pub const MAX_AUTHORIZATION_TTL_SECONDS: i64 = 5 * 60;

pub const PAYMENT_LINK_STATUS_ACTIVE: u8 = 0;
pub const PAYMENT_LINK_STATUS_CLAIMED: u8 = 1;
pub const PAYMENT_LINK_STATUS_CANCELLED: u8 = 2;
pub const PAYMENT_LINK_STATUS_REFUNDED: u8 = 3;

pub const SECP256R1_PROGRAM_ID: Pubkey =
    pubkey!("Secp256r1SigVerify1111111111111111111111111");