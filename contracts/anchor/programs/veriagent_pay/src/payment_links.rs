use anchor_lang::prelude::*;
use anchor_spl::{
    associated_token::AssociatedToken,
    token::{self, Mint, Token, TokenAccount, TransferChecked},
};

use crate::{
    auth::{challenge, verify_root_authorization, RootAuthorization},
    constants::{
        ACTION_CANCEL_SOL_PAYMENT_LINK, ACTION_CREATE_SOL_PAYMENT_LINK, CLAIM_AUTHORITY_SEED,
        MAX_PAYMENT_LINK_DURATION_SECONDS, PAYMENT_LINK_SEED,
        PAYMENT_LINK_STATUS_ACTIVE, PAYMENT_LINK_STATUS_CANCELLED, PAYMENT_LINK_STATUS_CLAIMED,
        PAYMENT_LINK_STATUS_REFUNDED, PROTOCOL_SEED, SESSION_ACTION_TRANSFER, SESSION_SEED,
        VAULT_SEED,
    },
    errors::VeriAgentError,
    native_sol::transfer_program_lamports,
    state::{ClaimAuthorityConfig, PaymentLink, ProtocolConfig, Session, Vault},
};

use anchor_lang::solana_program::sysvar::instructions;

#[derive(AnchorSerialize, AnchorDeserialize, Clone)]
pub struct InitializeClaimAuthorityArgs {
    pub authority: Pubkey,
}

#[derive(Accounts)]
pub struct InitializeClaimAuthority<'info> {
    #[account(mut, address = config.authority)]
    pub protocol_authority: Signer<'info>,
    #[account(seeds = [PROTOCOL_SEED], bump = config.bump)]
    pub config: Account<'info, ProtocolConfig>,
    #[account(
        init,
        payer = protocol_authority,
        space = 8 + ClaimAuthorityConfig::INIT_SPACE,
        seeds = [CLAIM_AUTHORITY_SEED],
        bump,
    )]
    pub claim_authority_config: Account<'info, ClaimAuthorityConfig>,
    pub system_program: Program<'info, System>,
}

pub fn initialize_claim_authority(
    ctx: Context<InitializeClaimAuthority>,
    args: InitializeClaimAuthorityArgs,
) -> Result<()> {
    require_keys_neq!(args.authority, Pubkey::default(), VeriAgentError::InvalidClaimAuthority);
    let config = &mut ctx.accounts.claim_authority_config;
    config.version = 1;
    config.bump = ctx.bumps.claim_authority_config;
    config.authority = args.authority;
    Ok(())
}

#[derive(AnchorSerialize, AnchorDeserialize, Clone)]
pub struct CreatePaymentLinkWithSessionArgs {
    pub link_id: [u8; 32],
    pub recipient_commitment: [u8; 32],
    pub amount: u64,
    pub expires_at: i64,
    pub session_nonce: u64,
}

#[derive(Accounts)]
#[instruction(args: CreatePaymentLinkWithSessionArgs)]
pub struct CreatePaymentLinkWithSession<'info> {
    #[account(mut)]
    pub payer: Signer<'info>,
    #[account(
        seeds = [PROTOCOL_SEED],
        bump = config.bump,
        constraint = !config.paused @ VeriAgentError::ProtocolPaused,
        constraint = config.stablecoin_mint == stablecoin_mint.key() @ VeriAgentError::InvalidStablecoinMint,
    )]
    pub config: Account<'info, ProtocolConfig>,
    #[account(
        seeds = [VAULT_SEED, vault.root_key_hash.as_ref(), vault.user_salt.as_ref()],
        bump = vault.bump,
    )]
    pub vault: Account<'info, Vault>,
    #[account(
        mut,
        seeds = [SESSION_SEED, vault.key().as_ref(), session_signer.key().as_ref()],
        bump = session.bump,
        constraint = session.vault == vault.key(),
        constraint = session.public_key == session_signer.key(),
    )]
    pub session: Account<'info, Session>,
    pub session_signer: Signer<'info>,
    #[account(address = config.stablecoin_mint)]
    pub stablecoin_mint: Account<'info, Mint>,
    #[account(
        mut,
        associated_token::mint = stablecoin_mint,
        associated_token::authority = vault,
        associated_token::token_program = token_program,
    )]
    pub vault_token_account: Account<'info, TokenAccount>,
    #[account(
        init,
        payer = payer,
        space = 8 + PaymentLink::INIT_SPACE,
        seeds = [PAYMENT_LINK_SEED, vault.key().as_ref(), args.link_id.as_ref()],
        bump,
    )]
    pub payment_link: Account<'info, PaymentLink>,
    #[account(
        init,
        payer = payer,
        associated_token::mint = stablecoin_mint,
        associated_token::authority = payment_link,
        associated_token::token_program = token_program,
    )]
    pub escrow_token_account: Account<'info, TokenAccount>,
    pub token_program: Program<'info, Token>,
    pub associated_token_program: Program<'info, AssociatedToken>,
    pub system_program: Program<'info, System>,
}

pub fn create_payment_link_with_session(
    ctx: Context<CreatePaymentLinkWithSession>,
    args: CreatePaymentLinkWithSessionArgs,
) -> Result<()> {
    require!(args.amount > 0, VeriAgentError::InvalidTransferAmount);
    require!(
        args.recipient_commitment != [0; 32],
        VeriAgentError::InvalidRecipientCommitment
    );
    let now = Clock::get()?.unix_timestamp;
    require!(
        args.expires_at > now
            && args.expires_at.saturating_sub(now) <= MAX_PAYMENT_LINK_DURATION_SECONDS,
        VeriAgentError::InvalidPaymentLinkExpiry
    );

    let session = &mut ctx.accounts.session;
    require!(!session.revoked, VeriAgentError::SessionRevoked);
    require!(
        now >= session.valid_after && now <= session.valid_until,
        VeriAgentError::SessionInactive
    );
    require!(
        session.action_bitmap & SESSION_ACTION_TRANSFER != 0,
        VeriAgentError::SessionActionDenied
    );
    require!(session.nonce == args.session_nonce, VeriAgentError::InvalidSessionNonce);
    require!(args.amount <= session.per_action_limit, VeriAgentError::PerActionLimitExceeded);
    let new_spent = session
        .spent
        .checked_add(args.amount)
        .ok_or_else(|| error!(VeriAgentError::ArithmeticOverflow))?;
    require!(new_spent <= session.cumulative_limit, VeriAgentError::CumulativeLimitExceeded);
    session.spent = new_spent;
    session.nonce = session
        .nonce
        .checked_add(1)
        .ok_or_else(|| error!(VeriAgentError::ArithmeticOverflow))?;

    let link = &mut ctx.accounts.payment_link;
    link.version = 1;
    link.bump = ctx.bumps.payment_link;
    link.status = PAYMENT_LINK_STATUS_ACTIVE;
    link.sender_vault = ctx.accounts.vault.key();
    link.mint = ctx.accounts.stablecoin_mint.key();
    link.link_id = args.link_id;
    link.recipient_commitment = args.recipient_commitment;
    link.amount = args.amount;
    link.expires_at = args.expires_at;
    link.created_at = now;
    link.settled_at = 0;
    link.claimed_destination = Pubkey::default();

    transfer_from_vault(
        &ctx.accounts.vault,
        &ctx.accounts.vault_token_account,
        &ctx.accounts.escrow_token_account,
        &ctx.accounts.stablecoin_mint,
        &ctx.accounts.token_program,
        args.amount,
    )
}

#[derive(Accounts)]
pub struct ClaimPaymentLink<'info> {
    #[account(mut)]
    pub claim_authority: Signer<'info>,
    #[account(
        seeds = [PROTOCOL_SEED],
        bump = config.bump,
        constraint = !config.paused @ VeriAgentError::ProtocolPaused,
        constraint = config.stablecoin_mint == stablecoin_mint.key() @ VeriAgentError::InvalidStablecoinMint,
    )]
    pub config: Account<'info, ProtocolConfig>,
    #[account(
        seeds = [CLAIM_AUTHORITY_SEED],
        bump = claim_authority_config.bump,
        constraint = claim_authority_config.authority == claim_authority.key() @ VeriAgentError::InvalidClaimAuthority,
    )]
    pub claim_authority_config: Account<'info, ClaimAuthorityConfig>,
    #[account(
        seeds = [VAULT_SEED, recipient_vault.root_key_hash.as_ref(), recipient_vault.user_salt.as_ref()],
        bump = recipient_vault.bump,
    )]
    pub recipient_vault: Account<'info, Vault>,
    #[account(
        mut,
        seeds = [PAYMENT_LINK_SEED, payment_link.sender_vault.as_ref(), payment_link.link_id.as_ref()],
        bump = payment_link.bump,
        constraint = payment_link.mint == stablecoin_mint.key() @ VeriAgentError::InvalidStablecoinMint,
    )]
    pub payment_link: Account<'info, PaymentLink>,
    #[account(address = config.stablecoin_mint)]
    pub stablecoin_mint: Account<'info, Mint>,
    #[account(
        mut,
        associated_token::mint = stablecoin_mint,
        associated_token::authority = payment_link,
        associated_token::token_program = token_program,
    )]
    pub escrow_token_account: Account<'info, TokenAccount>,
    #[account(
        init_if_needed,
        payer = claim_authority,
        associated_token::mint = stablecoin_mint,
        associated_token::authority = recipient_vault,
        associated_token::token_program = token_program,
    )]
    pub destination_token_account: Account<'info, TokenAccount>,
    pub token_program: Program<'info, Token>,
    pub associated_token_program: Program<'info, AssociatedToken>,
    pub system_program: Program<'info, System>,
}

pub fn claim_payment_link(ctx: Context<ClaimPaymentLink>) -> Result<()> {
    let now = Clock::get()?.unix_timestamp;
    require!(
        ctx.accounts.payment_link.status == PAYMENT_LINK_STATUS_ACTIVE,
        VeriAgentError::PaymentLinkNotActive
    );
    require!(now <= ctx.accounts.payment_link.expires_at, VeriAgentError::PaymentLinkExpired);

    transfer_from_link(
        &ctx.accounts.payment_link,
        &ctx.accounts.escrow_token_account,
        &ctx.accounts.destination_token_account,
        &ctx.accounts.stablecoin_mint,
        &ctx.accounts.token_program,
        ctx.accounts.payment_link.amount,
    )?;
    let link = &mut ctx.accounts.payment_link;
    link.status = PAYMENT_LINK_STATUS_CLAIMED;
    link.settled_at = now;
    link.claimed_destination = ctx.accounts.recipient_vault.key();
    Ok(())
}

#[derive(AnchorSerialize, AnchorDeserialize, Clone)]
pub struct CancelPaymentLinkWithSessionArgs {
    pub session_nonce: u64,
}

#[derive(Accounts)]
pub struct CancelPaymentLinkWithSession<'info> {
    #[account(seeds = [PROTOCOL_SEED], bump = config.bump, constraint = !config.paused @ VeriAgentError::ProtocolPaused)]
    pub config: Account<'info, ProtocolConfig>,
    #[account(
        seeds = [VAULT_SEED, vault.root_key_hash.as_ref(), vault.user_salt.as_ref()],
        bump = vault.bump,
    )]
    pub vault: Account<'info, Vault>,
    #[account(
        mut,
        seeds = [SESSION_SEED, vault.key().as_ref(), session_signer.key().as_ref()],
        bump = session.bump,
        constraint = session.vault == vault.key(),
        constraint = session.public_key == session_signer.key(),
    )]
    pub session: Account<'info, Session>,
    pub session_signer: Signer<'info>,
    #[account(
        mut,
        seeds = [PAYMENT_LINK_SEED, vault.key().as_ref(), payment_link.link_id.as_ref()],
        bump = payment_link.bump,
        constraint = payment_link.sender_vault == vault.key() @ VeriAgentError::InvalidPaymentLinkSender,
        constraint = payment_link.mint == stablecoin_mint.key() @ VeriAgentError::InvalidStablecoinMint,
    )]
    pub payment_link: Account<'info, PaymentLink>,
    #[account(address = config.stablecoin_mint)]
    pub stablecoin_mint: Account<'info, Mint>,
    #[account(
        mut,
        associated_token::mint = stablecoin_mint,
        associated_token::authority = payment_link,
        associated_token::token_program = token_program,
    )]
    pub escrow_token_account: Account<'info, TokenAccount>,
    #[account(
        mut,
        associated_token::mint = stablecoin_mint,
        associated_token::authority = vault,
        associated_token::token_program = token_program,
    )]
    pub vault_token_account: Account<'info, TokenAccount>,
    pub token_program: Program<'info, Token>,
}

pub fn cancel_payment_link_with_session(
    ctx: Context<CancelPaymentLinkWithSession>,
    args: CancelPaymentLinkWithSessionArgs,
) -> Result<()> {
    let now = Clock::get()?.unix_timestamp;
    require!(
        ctx.accounts.payment_link.status == PAYMENT_LINK_STATUS_ACTIVE,
        VeriAgentError::PaymentLinkNotActive
    );
    let session = &mut ctx.accounts.session;
    require!(!session.revoked, VeriAgentError::SessionRevoked);
    require!(now >= session.valid_after && now <= session.valid_until, VeriAgentError::SessionInactive);
    require!(session.action_bitmap & SESSION_ACTION_TRANSFER != 0, VeriAgentError::SessionActionDenied);
    require!(session.nonce == args.session_nonce, VeriAgentError::InvalidSessionNonce);
    session.nonce = session
        .nonce
        .checked_add(1)
        .ok_or_else(|| error!(VeriAgentError::ArithmeticOverflow))?;

    transfer_from_link(
        &ctx.accounts.payment_link,
        &ctx.accounts.escrow_token_account,
        &ctx.accounts.vault_token_account,
        &ctx.accounts.stablecoin_mint,
        &ctx.accounts.token_program,
        ctx.accounts.payment_link.amount,
    )?;
    let link = &mut ctx.accounts.payment_link;
    link.status = PAYMENT_LINK_STATUS_CANCELLED;
    link.settled_at = now;
    Ok(())
}

#[derive(Accounts)]
pub struct RefundExpiredPaymentLink<'info> {
    #[account(seeds = [PROTOCOL_SEED], bump = config.bump)]
    pub config: Account<'info, ProtocolConfig>,
    #[account(
        seeds = [VAULT_SEED, sender_vault.root_key_hash.as_ref(), sender_vault.user_salt.as_ref()],
        bump = sender_vault.bump,
        constraint = payment_link.sender_vault == sender_vault.key() @ VeriAgentError::InvalidPaymentLinkSender,
    )]
    pub sender_vault: Account<'info, Vault>,
    #[account(
        mut,
        seeds = [PAYMENT_LINK_SEED, sender_vault.key().as_ref(), payment_link.link_id.as_ref()],
        bump = payment_link.bump,
        constraint = payment_link.mint == stablecoin_mint.key() @ VeriAgentError::InvalidStablecoinMint,
    )]
    pub payment_link: Account<'info, PaymentLink>,
    #[account(address = config.stablecoin_mint)]
    pub stablecoin_mint: Account<'info, Mint>,
    #[account(
        mut,
        associated_token::mint = stablecoin_mint,
        associated_token::authority = payment_link,
        associated_token::token_program = token_program,
    )]
    pub escrow_token_account: Account<'info, TokenAccount>,
    #[account(
        mut,
        associated_token::mint = stablecoin_mint,
        associated_token::authority = sender_vault,
        associated_token::token_program = token_program,
    )]
    pub vault_token_account: Account<'info, TokenAccount>,
    pub token_program: Program<'info, Token>,
}

pub fn refund_expired_payment_link(ctx: Context<RefundExpiredPaymentLink>) -> Result<()> {
    let now = Clock::get()?.unix_timestamp;
    require!(
        ctx.accounts.payment_link.status == PAYMENT_LINK_STATUS_ACTIVE,
        VeriAgentError::PaymentLinkNotActive
    );
    require!(now > ctx.accounts.payment_link.expires_at, VeriAgentError::PaymentLinkNotExpired);

    transfer_from_link(
        &ctx.accounts.payment_link,
        &ctx.accounts.escrow_token_account,
        &ctx.accounts.vault_token_account,
        &ctx.accounts.stablecoin_mint,
        &ctx.accounts.token_program,
        ctx.accounts.payment_link.amount,
    )?;
    let link = &mut ctx.accounts.payment_link;
    link.status = PAYMENT_LINK_STATUS_REFUNDED;
    link.settled_at = now;
    Ok(())
}

#[derive(AnchorSerialize, AnchorDeserialize, Clone)]
pub struct CreateSolPaymentLinkWithPasskeyArgs {
    pub link_id: [u8; 32],
    pub recipient_commitment: [u8; 32],
    pub amount: u64,
    pub expires_at: i64,
    pub vault_nonce: u64,
    pub proof_expires_at: i64,
    pub authenticator_data: Vec<u8>,
    pub client_data_json: Vec<u8>,
}

#[derive(Accounts)]
#[instruction(args: CreateSolPaymentLinkWithPasskeyArgs)]
pub struct CreateSolPaymentLinkWithPasskey<'info> {
    #[account(mut)]
    pub payer: Signer<'info>,
    #[account(
        seeds = [PROTOCOL_SEED],
        bump = config.bump,
        constraint = !config.paused @ VeriAgentError::ProtocolPaused,
    )]
    pub config: Account<'info, ProtocolConfig>,
    #[account(
        mut,
        seeds = [VAULT_SEED, vault.root_key_hash.as_ref(), vault.user_salt.as_ref()],
        bump = vault.bump,
    )]
    pub vault: Account<'info, Vault>,
    #[account(
        init,
        payer = payer,
        space = 8 + PaymentLink::INIT_SPACE,
        seeds = [PAYMENT_LINK_SEED, vault.key().as_ref(), args.link_id.as_ref()],
        bump,
    )]
    pub payment_link: Account<'info, PaymentLink>,
    /// CHECK: Address constraint and instruction loader enforce the instructions sysvar.
    #[account(address = instructions::ID)]
    pub instructions_sysvar: UncheckedAccount<'info>,
    pub system_program: Program<'info, System>,
}

pub fn create_sol_payment_link_with_passkey(
    ctx: Context<CreateSolPaymentLinkWithPasskey>,
    args: CreateSolPaymentLinkWithPasskeyArgs,
) -> Result<()> {
    require!(args.amount > 0, VeriAgentError::InvalidTransferAmount);
    require!(
        args.recipient_commitment != [0; 32],
        VeriAgentError::InvalidRecipientCommitment
    );
    require!(
        ctx.accounts.vault.nonce == args.vault_nonce,
        VeriAgentError::InvalidVaultNonce
    );
    let now = Clock::get()?.unix_timestamp;
    require!(
        args.expires_at > now
            && args.expires_at.saturating_sub(now) <= MAX_PAYMENT_LINK_DURATION_SECONDS,
        VeriAgentError::InvalidPaymentLinkExpiry
    );

    let action = [ACTION_CREATE_SOL_PAYMENT_LINK];
    let amount = args.amount.to_le_bytes();
    let link_expiry = args.expires_at.to_le_bytes();
    let vault_nonce = args.vault_nonce.to_le_bytes();
    let proof_expiry = args.proof_expires_at.to_le_bytes();
    let expected_challenge = challenge(&[
        ctx.accounts.config.cluster_domain.as_ref(),
        crate::ID.as_ref(),
        action.as_ref(),
        ctx.accounts.config.key().as_ref(),
        ctx.accounts.vault.key().as_ref(),
        ctx.accounts.payment_link.key().as_ref(),
        args.link_id.as_ref(),
        args.recipient_commitment.as_ref(),
        amount.as_ref(),
        link_expiry.as_ref(),
        vault_nonce.as_ref(),
        proof_expiry.as_ref(),
    ]);
    verify_root_authorization(
        &ctx.accounts.config,
        &ctx.accounts.instructions_sysvar.to_account_info(),
        &Clock::get()?,
        RootAuthorization {
            root_public_key: &ctx.accounts.vault.root_public_key,
            authenticator_data: &args.authenticator_data,
            client_data_json: &args.client_data_json,
            expected_challenge,
            expires_at: args.proof_expires_at,
        },
    )?;

    ctx.accounts.vault.nonce = ctx
        .accounts
        .vault
        .nonce
        .checked_add(1)
        .ok_or_else(|| error!(VeriAgentError::ArithmeticOverflow))?;
    let link = &mut ctx.accounts.payment_link;
    link.version = 1;
    link.bump = ctx.bumps.payment_link;
    link.status = PAYMENT_LINK_STATUS_ACTIVE;
    link.sender_vault = ctx.accounts.vault.key();
    link.mint = Pubkey::default();
    link.link_id = args.link_id;
    link.recipient_commitment = args.recipient_commitment;
    link.amount = args.amount;
    link.expires_at = args.expires_at;
    link.created_at = now;
    link.settled_at = 0;
    link.claimed_destination = Pubkey::default();

    transfer_program_lamports(
        &ctx.accounts.vault.to_account_info(),
        &ctx.accounts.payment_link.to_account_info(),
        args.amount,
        VeriAgentError::InsufficientVaultLamports,
    )
}

#[derive(Accounts)]
pub struct ClaimSolPaymentLink<'info> {
    #[account(mut)]
    pub claim_authority: Signer<'info>,
    #[account(
        seeds = [PROTOCOL_SEED],
        bump = config.bump,
        constraint = !config.paused @ VeriAgentError::ProtocolPaused,
    )]
    pub config: Account<'info, ProtocolConfig>,
    #[account(
        seeds = [CLAIM_AUTHORITY_SEED],
        bump = claim_authority_config.bump,
        constraint = claim_authority_config.authority == claim_authority.key() @ VeriAgentError::InvalidClaimAuthority,
    )]
    pub claim_authority_config: Account<'info, ClaimAuthorityConfig>,
    #[account(
        mut,
        seeds = [VAULT_SEED, recipient_vault.root_key_hash.as_ref(), recipient_vault.user_salt.as_ref()],
        bump = recipient_vault.bump,
    )]
    pub recipient_vault: Account<'info, Vault>,
    #[account(
        mut,
        seeds = [PAYMENT_LINK_SEED, payment_link.sender_vault.as_ref(), payment_link.link_id.as_ref()],
        bump = payment_link.bump,
        constraint = payment_link.mint == Pubkey::default() @ VeriAgentError::InvalidNativePaymentLink,
    )]
    pub payment_link: Account<'info, PaymentLink>,
}

pub fn claim_sol_payment_link(ctx: Context<ClaimSolPaymentLink>) -> Result<()> {
    let now = Clock::get()?.unix_timestamp;
    require!(
        ctx.accounts.payment_link.status == PAYMENT_LINK_STATUS_ACTIVE,
        VeriAgentError::PaymentLinkNotActive
    );
    require!(now <= ctx.accounts.payment_link.expires_at, VeriAgentError::PaymentLinkExpired);
    transfer_program_lamports(
        &ctx.accounts.payment_link.to_account_info(),
        &ctx.accounts.recipient_vault.to_account_info(),
        ctx.accounts.payment_link.amount,
        VeriAgentError::InsufficientEscrowLamports,
    )?;
    let link = &mut ctx.accounts.payment_link;
    link.status = PAYMENT_LINK_STATUS_CLAIMED;
    link.settled_at = now;
    link.claimed_destination = ctx.accounts.recipient_vault.key();
    Ok(())
}

#[derive(AnchorSerialize, AnchorDeserialize, Clone)]
pub struct CancelSolPaymentLinkWithPasskeyArgs {
    pub vault_nonce: u64,
    pub proof_expires_at: i64,
    pub authenticator_data: Vec<u8>,
    pub client_data_json: Vec<u8>,
}

#[derive(Accounts)]
pub struct CancelSolPaymentLinkWithPasskey<'info> {
    #[account(mut)]
    pub payer: Signer<'info>,
    #[account(
        seeds = [PROTOCOL_SEED],
        bump = config.bump,
        constraint = !config.paused @ VeriAgentError::ProtocolPaused,
    )]
    pub config: Account<'info, ProtocolConfig>,
    #[account(
        mut,
        seeds = [VAULT_SEED, vault.root_key_hash.as_ref(), vault.user_salt.as_ref()],
        bump = vault.bump,
    )]
    pub vault: Account<'info, Vault>,
    #[account(
        mut,
        seeds = [PAYMENT_LINK_SEED, vault.key().as_ref(), payment_link.link_id.as_ref()],
        bump = payment_link.bump,
        constraint = payment_link.sender_vault == vault.key() @ VeriAgentError::InvalidPaymentLinkSender,
        constraint = payment_link.mint == Pubkey::default() @ VeriAgentError::InvalidNativePaymentLink,
    )]
    pub payment_link: Account<'info, PaymentLink>,
    /// CHECK: Address constraint and instruction loader enforce the instructions sysvar.
    #[account(address = instructions::ID)]
    pub instructions_sysvar: UncheckedAccount<'info>,
}

pub fn cancel_sol_payment_link_with_passkey(
    ctx: Context<CancelSolPaymentLinkWithPasskey>,
    args: CancelSolPaymentLinkWithPasskeyArgs,
) -> Result<()> {
    require!(
        ctx.accounts.payment_link.status == PAYMENT_LINK_STATUS_ACTIVE,
        VeriAgentError::PaymentLinkNotActive
    );
    require!(
        ctx.accounts.vault.nonce == args.vault_nonce,
        VeriAgentError::InvalidVaultNonce
    );
    let action = [ACTION_CANCEL_SOL_PAYMENT_LINK];
    let vault_nonce = args.vault_nonce.to_le_bytes();
    let proof_expiry = args.proof_expires_at.to_le_bytes();
    let expected_challenge = challenge(&[
        ctx.accounts.config.cluster_domain.as_ref(),
        crate::ID.as_ref(),
        action.as_ref(),
        ctx.accounts.config.key().as_ref(),
        ctx.accounts.vault.key().as_ref(),
        ctx.accounts.payment_link.key().as_ref(),
        vault_nonce.as_ref(),
        proof_expiry.as_ref(),
    ]);
    verify_root_authorization(
        &ctx.accounts.config,
        &ctx.accounts.instructions_sysvar.to_account_info(),
        &Clock::get()?,
        RootAuthorization {
            root_public_key: &ctx.accounts.vault.root_public_key,
            authenticator_data: &args.authenticator_data,
            client_data_json: &args.client_data_json,
            expected_challenge,
            expires_at: args.proof_expires_at,
        },
    )?;

    ctx.accounts.vault.nonce = ctx
        .accounts
        .vault
        .nonce
        .checked_add(1)
        .ok_or_else(|| error!(VeriAgentError::ArithmeticOverflow))?;
    transfer_program_lamports(
        &ctx.accounts.payment_link.to_account_info(),
        &ctx.accounts.vault.to_account_info(),
        ctx.accounts.payment_link.amount,
        VeriAgentError::InsufficientEscrowLamports,
    )?;
    let link = &mut ctx.accounts.payment_link;
    link.status = PAYMENT_LINK_STATUS_CANCELLED;
    link.settled_at = Clock::get()?.unix_timestamp;
    Ok(())
}

#[derive(Accounts)]
pub struct RefundExpiredSolPaymentLink<'info> {
    #[account(seeds = [PROTOCOL_SEED], bump = config.bump)]
    pub config: Account<'info, ProtocolConfig>,
    #[account(
        mut,
        seeds = [VAULT_SEED, sender_vault.root_key_hash.as_ref(), sender_vault.user_salt.as_ref()],
        bump = sender_vault.bump,
        constraint = payment_link.sender_vault == sender_vault.key() @ VeriAgentError::InvalidPaymentLinkSender,
    )]
    pub sender_vault: Account<'info, Vault>,
    #[account(
        mut,
        seeds = [PAYMENT_LINK_SEED, sender_vault.key().as_ref(), payment_link.link_id.as_ref()],
        bump = payment_link.bump,
        constraint = payment_link.mint == Pubkey::default() @ VeriAgentError::InvalidNativePaymentLink,
    )]
    pub payment_link: Account<'info, PaymentLink>,
}

pub fn refund_expired_sol_payment_link(ctx: Context<RefundExpiredSolPaymentLink>) -> Result<()> {
    let now = Clock::get()?.unix_timestamp;
    require!(
        ctx.accounts.payment_link.status == PAYMENT_LINK_STATUS_ACTIVE,
        VeriAgentError::PaymentLinkNotActive
    );
    require!(now > ctx.accounts.payment_link.expires_at, VeriAgentError::PaymentLinkNotExpired);
    transfer_program_lamports(
        &ctx.accounts.payment_link.to_account_info(),
        &ctx.accounts.sender_vault.to_account_info(),
        ctx.accounts.payment_link.amount,
        VeriAgentError::InsufficientEscrowLamports,
    )?;
    let link = &mut ctx.accounts.payment_link;
    link.status = PAYMENT_LINK_STATUS_REFUNDED;
    link.settled_at = now;
    Ok(())
}

fn transfer_from_vault<'info>(
    vault: &Account<'info, Vault>,
    source: &Account<'info, TokenAccount>,
    destination: &Account<'info, TokenAccount>,
    mint: &Account<'info, Mint>,
    token_program: &Program<'info, Token>,
    amount: u64,
) -> Result<()> {
    let bump = [vault.bump];
    let signer_seeds: &[&[u8]] = &[
        VAULT_SEED,
        vault.root_key_hash.as_ref(),
        vault.user_salt.as_ref(),
        bump.as_ref(),
    ];
    transfer_checked(source, destination, mint, token_program, vault.to_account_info(), signer_seeds, amount)
}

fn transfer_from_link<'info>(
    link: &Account<'info, PaymentLink>,
    source: &Account<'info, TokenAccount>,
    destination: &Account<'info, TokenAccount>,
    mint: &Account<'info, Mint>,
    token_program: &Program<'info, Token>,
    amount: u64,
) -> Result<()> {
    let bump = [link.bump];
    let signer_seeds: &[&[u8]] = &[
        PAYMENT_LINK_SEED,
        link.sender_vault.as_ref(),
        link.link_id.as_ref(),
        bump.as_ref(),
    ];
    transfer_checked(source, destination, mint, token_program, link.to_account_info(), signer_seeds, amount)
}

fn transfer_checked<'info>(
    source: &Account<'info, TokenAccount>,
    destination: &Account<'info, TokenAccount>,
    mint: &Account<'info, Mint>,
    token_program: &Program<'info, Token>,
    authority: AccountInfo<'info>,
    signer_seeds: &[&[u8]],
    amount: u64,
) -> Result<()> {
    let signer = [signer_seeds];
    let accounts = TransferChecked {
        from: source.to_account_info(),
        mint: mint.to_account_info(),
        to: destination.to_account_info(),
        authority,
    };
    token::transfer_checked(
        CpiContext::new_with_signer(token_program.to_account_info(), accounts, &signer),
        amount,
        mint.decimals,
    )
}