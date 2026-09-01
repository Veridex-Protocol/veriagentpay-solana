use anchor_lang::prelude::*;
use anchor_spl::token::Mint;

use crate::{constants::PROTOCOL_SEED, state::ProtocolConfig};

#[derive(AnchorSerialize, AnchorDeserialize, Clone)]
pub struct InitializeProtocolArgs {
    pub rp_id_hash: [u8; 32],
    pub origin_hash: [u8; 32],
    pub cluster_domain: [u8; 32],
}

#[derive(Accounts)]
pub struct InitializeProtocol<'info> {
    #[account(mut)]
    pub authority: Signer<'info>,
    #[account(
        init,
        payer = authority,
        space = 8 + ProtocolConfig::INIT_SPACE,
        seeds = [PROTOCOL_SEED],
        bump,
    )]
    pub config: Account<'info, ProtocolConfig>,
    pub stablecoin_mint: Account<'info, Mint>,
    pub system_program: Program<'info, System>,
}

pub fn initialize_protocol(
    ctx: Context<InitializeProtocol>,
    args: InitializeProtocolArgs,
) -> Result<()> {
    let config = &mut ctx.accounts.config;
    config.version = 1;
    config.bump = ctx.bumps.config;
    config.paused = false;
    config.authority = ctx.accounts.authority.key();
    config.stablecoin_mint = ctx.accounts.stablecoin_mint.key();
    config.rp_id_hash = args.rp_id_hash;
    config.origin_hash = args.origin_hash;
    config.cluster_domain = args.cluster_domain;
    Ok(())
}