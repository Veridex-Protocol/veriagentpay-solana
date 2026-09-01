use anchor_lang::prelude::*;

#[account]
#[derive(InitSpace)]
pub struct ProtocolConfig {
    pub version: u8,
    pub bump: u8,
    pub paused: bool,
    pub authority: Pubkey,
    pub stablecoin_mint: Pubkey,
    pub rp_id_hash: [u8; 32],
    pub origin_hash: [u8; 32],
    pub cluster_domain: [u8; 32],
}

#[account]
#[derive(InitSpace)]
pub struct Vault {
    pub version: u8,
    pub bump: u8,
    pub root_public_key: [u8; 33],
    pub root_key_hash: [u8; 32],
    pub user_salt: [u8; 32],
    pub nonce: u64,
    pub created_at: i64,
}

#[account]
#[derive(InitSpace)]
pub struct Session {
    pub version: u8,
    pub bump: u8,
    pub revoked: bool,
    pub vault: Pubkey,
    pub public_key: Pubkey,
    pub action_bitmap: u16,
    pub per_action_limit: u64,
    pub cumulative_limit: u64,
    pub spent: u64,
    pub valid_after: i64,
    pub valid_until: i64,
    pub nonce: u64,
}