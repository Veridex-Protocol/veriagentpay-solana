use anchor_lang::{
    prelude::*,
    solana_program::{hash::hash, sysvar::instructions},
};
use anchor_spl::{
    associated_token::AssociatedToken,
    token::{self, Mint, Token, TokenAccount, TransferChecked},
};

use crate::{
    auth::{challenge, verify_root_authorization, RootAuthorization},
    constants::{
        ACTION_GRANT_SESSION, ACTION_INITIALIZE_VAULT, ACTION_TRANSFER,
        ACTION_INITIALIZE_VAULT_AND_GRANT_SESSION, MAX_SESSION_DURATION_SECONDS,
        PROTOCOL_SEED, SESSION_ACTION_TRANSFER, SESSION_SEED, SUPPORTED_SESSION_ACTIONS,
        VAULT_SEED,
    },
    errors::VeriAgentError,
    state::{ProtocolConfig, Session, Vault},
};

#[derive(AnchorSerialize, AnchorDeserialize, Clone)]
pub struct InitializeVaultArgs {
    pub root_public_key: [u8; 33],
    pub root_key_hash: [u8; 32],
    pub user_salt: [u8; 32],
    pub proof_expires_at: i64,
    pub authenticator_data: Vec<u8>,
    pub client_data_json: Vec<u8>,
}

#[derive(Accounts)]
#[instruction(args: InitializeVaultArgs)]
pub struct InitializeVault<'info> {
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
        init,
        payer = payer,
        space = 8 + Vault::INIT_SPACE,
        seeds = [VAULT_SEED, args.root_key_hash.as_ref(), args.user_salt.as_ref()],
        bump,
    )]
    pub vault: Account<'info, Vault>,
    #[account(address = config.stablecoin_mint)]
    pub stablecoin_mint: Account<'info, Mint>,
    #[account(
        init_if_needed,
        payer = payer,
        associated_token::mint = stablecoin_mint,
        associated_token::authority = vault,
        associated_token::token_program = token_program,
    )]
    pub vault_token_account: Account<'info, TokenAccount>,
    /// CHECK: Address constraint and instruction loader enforce the instructions sysvar.
    #[account(address = instructions::ID)]
    pub instructions_sysvar: UncheckedAccount<'info>,
    pub token_program: Program<'info, Token>,
    pub associated_token_program: Program<'info, AssociatedToken>,
    pub system_program: Program<'info, System>,
}

pub fn initialize_vault(
    ctx: Context<InitializeVault>,
    args: InitializeVaultArgs,
) -> Result<()> {
    let computed_root_key_hash = hash(&args.root_public_key).to_bytes();
    require!(
        computed_root_key_hash == args.root_key_hash,
        VeriAgentError::InvalidRootKeyHash
    );

    let nonce = 0u64.to_le_bytes();
    let expires_at = args.proof_expires_at.to_le_bytes();
    let action = [ACTION_INITIALIZE_VAULT];
    let expected_challenge = challenge(&[
        ctx.accounts.config.cluster_domain.as_ref(),
        crate::ID.as_ref(),
        action.as_ref(),
        ctx.accounts.config.key().as_ref(),
        ctx.accounts.vault.key().as_ref(),
        ctx.accounts.vault_token_account.key().as_ref(),
        args.root_public_key.as_ref(),
        args.root_key_hash.as_ref(),
        args.user_salt.as_ref(),
        nonce.as_ref(),
        expires_at.as_ref(),
    ]);
    verify_root_authorization(
        &ctx.accounts.config,
        &ctx.accounts.instructions_sysvar.to_account_info(),
        &Clock::get()?,
        RootAuthorization {
            root_public_key: &args.root_public_key,
            authenticator_data: &args.authenticator_data,
            client_data_json: &args.client_data_json,
            expected_challenge,
            expires_at: args.proof_expires_at,
        },
    )?;

    let vault = &mut ctx.accounts.vault;
    vault.version = 1;
    vault.bump = ctx.bumps.vault;
    vault.root_public_key = args.root_public_key;
    vault.root_key_hash = args.root_key_hash;
    vault.user_salt = args.user_salt;
    vault.nonce = 0;
    vault.created_at = Clock::get()?.unix_timestamp;
    Ok(())
}

#[derive(AnchorSerialize, AnchorDeserialize, Clone)]
pub struct GrantSessionArgs {
    pub session_public_key: Pubkey,
    pub action_bitmap: u16,
    pub per_action_limit: u64,
    pub cumulative_limit: u64,
    pub valid_after: i64,
    pub valid_until: i64,
    pub vault_nonce: u64,
    pub proof_expires_at: i64,
    pub authenticator_data: Vec<u8>,
    pub client_data_json: Vec<u8>,
}

#[derive(Accounts)]
#[instruction(args: GrantSessionArgs)]
pub struct GrantSession<'info> {
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
        space = 8 + Session::INIT_SPACE,
        seeds = [SESSION_SEED, vault.key().as_ref(), args.session_public_key.as_ref()],
        bump,
    )]
    pub session: Account<'info, Session>,
    /// CHECK: Address constraint and instruction loader enforce the instructions sysvar.
    #[account(address = instructions::ID)]
    pub instructions_sysvar: UncheckedAccount<'info>,
    pub system_program: Program<'info, System>,
}

pub fn grant_session(ctx: Context<GrantSession>, args: GrantSessionArgs) -> Result<()> {
    require!(
        ctx.accounts.vault.nonce == args.vault_nonce,
        VeriAgentError::InvalidVaultNonce
    );
    require!(
        args.valid_after <= args.valid_until
            && args.valid_until.saturating_sub(args.valid_after)
                <= MAX_SESSION_DURATION_SECONDS,
        VeriAgentError::InvalidSessionWindow
    );
    require!(
        args.action_bitmap != 0 && args.action_bitmap & !SUPPORTED_SESSION_ACTIONS == 0,
        VeriAgentError::InvalidSessionActions
    );
    require!(
        args.per_action_limit > 0
            && args.per_action_limit <= args.cumulative_limit,
        VeriAgentError::InvalidSessionLimits
    );

    let action = [ACTION_GRANT_SESSION];
    let action_bitmap = args.action_bitmap.to_le_bytes();
    let per_action_limit = args.per_action_limit.to_le_bytes();
    let cumulative_limit = args.cumulative_limit.to_le_bytes();
    let valid_after = args.valid_after.to_le_bytes();
    let valid_until = args.valid_until.to_le_bytes();
    let vault_nonce = args.vault_nonce.to_le_bytes();
    let expires_at = args.proof_expires_at.to_le_bytes();
    let expected_challenge = challenge(&[
        ctx.accounts.config.cluster_domain.as_ref(),
        crate::ID.as_ref(),
        action.as_ref(),
        ctx.accounts.config.key().as_ref(),
        ctx.accounts.vault.key().as_ref(),
        ctx.accounts.session.key().as_ref(),
        args.session_public_key.as_ref(),
        action_bitmap.as_ref(),
        per_action_limit.as_ref(),
        cumulative_limit.as_ref(),
        valid_after.as_ref(),
        valid_until.as_ref(),
        vault_nonce.as_ref(),
        expires_at.as_ref(),
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

    let session = &mut ctx.accounts.session;
    session.version = 1;
    session.bump = ctx.bumps.session;
    session.revoked = false;
    session.vault = ctx.accounts.vault.key();
    session.public_key = args.session_public_key;
    session.action_bitmap = args.action_bitmap;
    session.per_action_limit = args.per_action_limit;
    session.cumulative_limit = args.cumulative_limit;
    session.spent = 0;
    session.valid_after = args.valid_after;
    session.valid_until = args.valid_until;
    session.nonce = 0;
    Ok(())
}

#[derive(AnchorSerialize, AnchorDeserialize, Clone)]
pub struct InitializeVaultAndGrantSessionArgs {
    pub root_public_key: [u8; 33],
    pub root_key_hash: [u8; 32],
    pub user_salt: [u8; 32],
    pub session_public_key: Pubkey,
    pub action_bitmap: u16,
    pub per_action_limit: u64,
    pub cumulative_limit: u64,
    pub valid_after: i64,
    pub valid_until: i64,
    pub proof_expires_at: i64,
    pub authenticator_data: Vec<u8>,
    pub client_data_json: Vec<u8>,
}

#[derive(Accounts)]
#[instruction(args: InitializeVaultAndGrantSessionArgs)]
pub struct InitializeVaultAndGrantSession<'info> {
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
        init,
        payer = payer,
        space = 8 + Vault::INIT_SPACE,
        seeds = [VAULT_SEED, args.root_key_hash.as_ref(), args.user_salt.as_ref()],
        bump,
    )]
    pub vault: Account<'info, Vault>,
    #[account(
        init,
        payer = payer,
        space = 8 + Session::INIT_SPACE,
        seeds = [SESSION_SEED, vault.key().as_ref(), args.session_public_key.as_ref()],
        bump,
    )]
    pub session: Account<'info, Session>,
    #[account(address = config.stablecoin_mint)]
    pub stablecoin_mint: Account<'info, Mint>,
    #[account(
        init_if_needed,
        payer = payer,
        associated_token::mint = stablecoin_mint,
        associated_token::authority = vault,
        associated_token::token_program = token_program,
    )]
    pub vault_token_account: Account<'info, TokenAccount>,
    /// CHECK: Address constraint and instruction loader enforce the instructions sysvar.
    #[account(address = instructions::ID)]
    pub instructions_sysvar: UncheckedAccount<'info>,
    pub token_program: Program<'info, Token>,
    pub associated_token_program: Program<'info, AssociatedToken>,
    pub system_program: Program<'info, System>,
}

pub fn initialize_vault_and_grant_session(
    ctx: Context<InitializeVaultAndGrantSession>,
    args: InitializeVaultAndGrantSessionArgs,
) -> Result<()> {
    require!(
        hash(&args.root_public_key).to_bytes() == args.root_key_hash,
        VeriAgentError::InvalidRootKeyHash
    );
    validate_session_policy(
        args.action_bitmap,
        args.per_action_limit,
        args.cumulative_limit,
        args.valid_after,
        args.valid_until,
    )?;

    let action = [ACTION_INITIALIZE_VAULT_AND_GRANT_SESSION];
    let action_bitmap = args.action_bitmap.to_le_bytes();
    let per_action_limit = args.per_action_limit.to_le_bytes();
    let cumulative_limit = args.cumulative_limit.to_le_bytes();
    let valid_after = args.valid_after.to_le_bytes();
    let valid_until = args.valid_until.to_le_bytes();
    let nonce = 0u64.to_le_bytes();
    let expires_at = args.proof_expires_at.to_le_bytes();
    let expected_challenge = challenge(&[
        ctx.accounts.config.cluster_domain.as_ref(),
        crate::ID.as_ref(),
        action.as_ref(),
        ctx.accounts.config.key().as_ref(),
        ctx.accounts.vault.key().as_ref(),
        ctx.accounts.session.key().as_ref(),
        ctx.accounts.vault_token_account.key().as_ref(),
        ctx.accounts.stablecoin_mint.key().as_ref(),
        args.root_public_key.as_ref(),
        args.root_key_hash.as_ref(),
        args.user_salt.as_ref(),
        args.session_public_key.as_ref(),
        action_bitmap.as_ref(),
        per_action_limit.as_ref(),
        cumulative_limit.as_ref(),
        valid_after.as_ref(),
        valid_until.as_ref(),
        nonce.as_ref(),
        expires_at.as_ref(),
    ]);
    verify_root_authorization(
        &ctx.accounts.config,
        &ctx.accounts.instructions_sysvar.to_account_info(),
        &Clock::get()?,
        RootAuthorization {
            root_public_key: &args.root_public_key,
            authenticator_data: &args.authenticator_data,
            client_data_json: &args.client_data_json,
            expected_challenge,
            expires_at: args.proof_expires_at,
        },
    )?;

    let now = Clock::get()?.unix_timestamp;
    let vault = &mut ctx.accounts.vault;
    vault.version = 1;
    vault.bump = ctx.bumps.vault;
    vault.root_public_key = args.root_public_key;
    vault.root_key_hash = args.root_key_hash;
    vault.user_salt = args.user_salt;
    vault.nonce = 1;
    vault.created_at = now;

    write_session(
        &mut ctx.accounts.session,
        ctx.bumps.session,
        ctx.accounts.vault.key(),
        args.session_public_key,
        args.action_bitmap,
        args.per_action_limit,
        args.cumulative_limit,
        args.valid_after,
        args.valid_until,
    );
    Ok(())
}

#[derive(AnchorSerialize, AnchorDeserialize, Clone)]
pub struct PasskeyTransferArgs {
    pub amount: u64,
    pub vault_nonce: u64,
    pub proof_expires_at: i64,
    pub authenticator_data: Vec<u8>,
    pub client_data_json: Vec<u8>,
}

#[derive(Accounts)]
pub struct TransferWithPasskey<'info> {
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
        mut,
        seeds = [VAULT_SEED, vault.root_key_hash.as_ref(), vault.user_salt.as_ref()],
        bump = vault.bump,
    )]
    pub vault: Account<'info, Vault>,
    #[account(address = config.stablecoin_mint)]
    pub stablecoin_mint: Account<'info, Mint>,
    #[account(
        mut,
        associated_token::mint = stablecoin_mint,
        associated_token::authority = vault,
        associated_token::token_program = token_program,
    )]
    pub vault_token_account: Account<'info, TokenAccount>,
    #[account(mut, token::mint = stablecoin_mint)]
    pub destination_token_account: Account<'info, TokenAccount>,
    /// CHECK: Address constraint and instruction loader enforce the instructions sysvar.
    #[account(address = instructions::ID)]
    pub instructions_sysvar: UncheckedAccount<'info>,
    pub token_program: Program<'info, Token>,
}

pub fn transfer_with_passkey(
    ctx: Context<TransferWithPasskey>,
    args: PasskeyTransferArgs,
) -> Result<()> {
    require!(args.amount > 0, VeriAgentError::InvalidTransferAmount);
    require_keys_neq!(
        ctx.accounts.vault_token_account.key(),
        ctx.accounts.destination_token_account.key(),
        VeriAgentError::IdenticalTokenAccounts
    );
    require!(
        ctx.accounts.vault.nonce == args.vault_nonce,
        VeriAgentError::InvalidVaultNonce
    );

    let action = [ACTION_TRANSFER];
    let amount = args.amount.to_le_bytes();
    let vault_nonce = args.vault_nonce.to_le_bytes();
    let expires_at = args.proof_expires_at.to_le_bytes();
    let expected_challenge = challenge(&[
        ctx.accounts.config.cluster_domain.as_ref(),
        crate::ID.as_ref(),
        action.as_ref(),
        ctx.accounts.config.key().as_ref(),
        ctx.accounts.vault.key().as_ref(),
        ctx.accounts.vault_token_account.key().as_ref(),
        ctx.accounts.destination_token_account.key().as_ref(),
        ctx.accounts.stablecoin_mint.key().as_ref(),
        amount.as_ref(),
        vault_nonce.as_ref(),
        expires_at.as_ref(),
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
    transfer_from_vault(
        &ctx.accounts.vault,
        &ctx.accounts.vault_token_account,
        &ctx.accounts.destination_token_account,
        &ctx.accounts.stablecoin_mint,
        &ctx.accounts.token_program,
        args.amount,
    )
}

#[derive(AnchorSerialize, AnchorDeserialize, Clone)]
pub struct SessionTransferArgs {
    pub amount: u64,
    pub session_nonce: u64,
}

#[derive(Accounts)]
pub struct TransferWithSession<'info> {
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
    #[account(mut, token::mint = stablecoin_mint)]
    pub destination_token_account: Account<'info, TokenAccount>,
    pub token_program: Program<'info, Token>,
}

pub fn transfer_with_session(
    ctx: Context<TransferWithSession>,
    args: SessionTransferArgs,
) -> Result<()> {
    require!(args.amount > 0, VeriAgentError::InvalidTransferAmount);
    require_keys_neq!(
        ctx.accounts.vault_token_account.key(),
        ctx.accounts.destination_token_account.key(),
        VeriAgentError::IdenticalTokenAccounts
    );

    let now = Clock::get()?.unix_timestamp;
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
    require!(
        session.nonce == args.session_nonce,
        VeriAgentError::InvalidSessionNonce
    );
    require!(
        args.amount <= session.per_action_limit,
        VeriAgentError::PerActionLimitExceeded
    );
    let new_spent = session
        .spent
        .checked_add(args.amount)
        .ok_or_else(|| error!(VeriAgentError::ArithmeticOverflow))?;
    require!(
        new_spent <= session.cumulative_limit,
        VeriAgentError::CumulativeLimitExceeded
    );
    session.spent = new_spent;
    session.nonce = session
        .nonce
        .checked_add(1)
        .ok_or_else(|| error!(VeriAgentError::ArithmeticOverflow))?;

    transfer_from_vault(
        &ctx.accounts.vault,
        &ctx.accounts.vault_token_account,
        &ctx.accounts.destination_token_account,
        &ctx.accounts.stablecoin_mint,
        &ctx.accounts.token_program,
        args.amount,
    )
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
    let signer = [signer_seeds];
    let accounts = TransferChecked {
        from: source.to_account_info(),
        mint: mint.to_account_info(),
        to: destination.to_account_info(),
        authority: vault.to_account_info(),
    };
    token::transfer_checked(
        CpiContext::new_with_signer(token_program.to_account_info(), accounts, &signer),
        amount,
        mint.decimals,
    )
}

fn validate_session_policy(
    action_bitmap: u16,
    per_action_limit: u64,
    cumulative_limit: u64,
    valid_after: i64,
    valid_until: i64,
) -> Result<()> {
    require!(
        valid_after <= valid_until
            && valid_until.saturating_sub(valid_after) <= MAX_SESSION_DURATION_SECONDS,
        VeriAgentError::InvalidSessionWindow
    );
    require!(
        action_bitmap != 0 && action_bitmap & !SUPPORTED_SESSION_ACTIONS == 0,
        VeriAgentError::InvalidSessionActions
    );
    require!(
        per_action_limit > 0 && per_action_limit <= cumulative_limit,
        VeriAgentError::InvalidSessionLimits
    );
    Ok(())
}

#[allow(clippy::too_many_arguments)]
fn write_session(
    session: &mut Account<Session>,
    bump: u8,
    vault: Pubkey,
    public_key: Pubkey,
    action_bitmap: u16,
    per_action_limit: u64,
    cumulative_limit: u64,
    valid_after: i64,
    valid_until: i64,
) {
    session.version = 1;
    session.bump = bump;
    session.revoked = false;
    session.vault = vault;
    session.public_key = public_key;
    session.action_bitmap = action_bitmap;
    session.per_action_limit = per_action_limit;
    session.cumulative_limit = cumulative_limit;
    session.spent = 0;
    session.valid_after = valid_after;
    session.valid_until = valid_until;
    session.nonce = 0;
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn initialize_vault_challenge_matches_client_fixture() {
        let cluster = [1; 32];
        let config = Pubkey::new_from_array([2; 32]);
        let vault = Pubkey::new_from_array([3; 32]);
        let vault_token_account = Pubkey::new_from_array([4; 32]);
        let mut root_public_key = [5; 33];
        root_public_key[0] = 2;
        let root_key_hash = [6; 32];
        let user_salt = [7; 32];
        let action = [ACTION_INITIALIZE_VAULT];
        let nonce = 0u64.to_le_bytes();
        let expires_at = 1_800_000_000i64.to_le_bytes();

        assert_eq!(
            challenge(&[
                cluster.as_ref(),
                crate::ID.as_ref(),
                action.as_ref(),
                config.as_ref(),
                vault.as_ref(),
                vault_token_account.as_ref(),
                root_public_key.as_ref(),
                root_key_hash.as_ref(),
                user_salt.as_ref(),
                nonce.as_ref(),
                expires_at.as_ref(),
            ]),
            [
                0x03, 0xb1, 0xbd, 0x36, 0x6a, 0x40, 0xc3, 0xf1, 0x73, 0xc3, 0x1c, 0x3b,
                0x32, 0xfe, 0x46, 0xb4, 0xd7, 0x95, 0xf2, 0x78, 0xc8, 0xdd, 0xc4, 0x73,
                0x6c, 0xa1, 0xb1, 0x7a, 0xf8, 0xf0, 0x1c, 0x5c,
            ]
        );
    }

    #[test]
    fn transfer_challenge_matches_client_fixture() {
        let cluster = [1; 32];
        let config = Pubkey::new_from_array([2; 32]);
        let vault = Pubkey::new_from_array([3; 32]);
        let vault_token_account = Pubkey::new_from_array([4; 32]);
        let destination = Pubkey::new_from_array([5; 32]);
        let mint = Pubkey::new_from_array([6; 32]);
        let action = [ACTION_TRANSFER];
        let amount = 1_250_000u64.to_le_bytes();
        let nonce = 7u64.to_le_bytes();
        let expires_at = 1_800_000_000i64.to_le_bytes();

        assert_eq!(
            challenge(&[
                cluster.as_ref(),
                crate::ID.as_ref(),
                action.as_ref(),
                config.as_ref(),
                vault.as_ref(),
                vault_token_account.as_ref(),
                destination.as_ref(),
                mint.as_ref(),
                amount.as_ref(),
                nonce.as_ref(),
                expires_at.as_ref(),
            ]),
            [
                0xc0, 0x67, 0x67, 0x3d, 0xbd, 0x17, 0x5c, 0xd3, 0x06, 0x93, 0x12, 0x61,
                0xef, 0x18, 0xb4, 0x81, 0x8c, 0x98, 0x01, 0xea, 0xe7, 0x58, 0x06, 0xf1,
                0x56, 0x7c, 0x6e, 0x8d, 0xc8, 0x7b, 0x1d, 0x0c,
            ]
        );
    }

    #[test]
    fn transfer_challenge_binds_amount_and_destination() {
        let cluster = [1; 32];
        let destination_a = Pubkey::new_unique();
        let destination_b = Pubkey::new_unique();
        let amount_a = 1_000_000u64.to_le_bytes();
        let amount_b = 2_000_000u64.to_le_bytes();
        let challenge_a = challenge(&[
            cluster.as_ref(),
            destination_a.as_ref(),
            amount_a.as_ref(),
        ]);
        let challenge_b = challenge(&[
            cluster.as_ref(),
            destination_b.as_ref(),
            amount_a.as_ref(),
        ]);
        let challenge_c = challenge(&[
            cluster.as_ref(),
            destination_a.as_ref(),
            amount_b.as_ref(),
        ]);

        assert_ne!(challenge_a, challenge_b);
        assert_ne!(challenge_a, challenge_c);
    }
}