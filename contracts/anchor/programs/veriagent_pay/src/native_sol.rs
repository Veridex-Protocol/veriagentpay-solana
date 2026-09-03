use anchor_lang::{
    prelude::*,
    solana_program::sysvar::instructions,
};

use crate::{
    auth::{challenge, verify_root_authorization, RootAuthorization},
    constants::{ACTION_TRANSFER_SOL, PROTOCOL_SEED, VAULT_SEED},
    errors::VeriAgentError,
    state::{ProtocolConfig, Vault},
};

#[derive(AnchorSerialize, AnchorDeserialize, Clone)]
pub struct SolPasskeyTransferArgs {
    pub amount: u64,
    pub vault_nonce: u64,
    pub proof_expires_at: i64,
    pub authenticator_data: Vec<u8>,
    pub client_data_json: Vec<u8>,
}

#[derive(Accounts)]
pub struct TransferSolWithPasskey<'info> {
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
    /// CHECK: The passkey challenge binds this exact destination account.
    #[account(mut)]
    pub recipient: UncheckedAccount<'info>,
    /// CHECK: Address constraint and instruction loader enforce the instructions sysvar.
    #[account(address = instructions::ID)]
    pub instructions_sysvar: UncheckedAccount<'info>,
}

pub fn transfer_sol_with_passkey(
    ctx: Context<TransferSolWithPasskey>,
    args: SolPasskeyTransferArgs,
) -> Result<()> {
    require!(args.amount > 0, VeriAgentError::InvalidTransferAmount);
    require_keys_neq!(
        ctx.accounts.vault.key(),
        ctx.accounts.recipient.key(),
        VeriAgentError::IdenticalAccounts
    );
    require!(
        ctx.accounts.vault.nonce == args.vault_nonce,
        VeriAgentError::InvalidVaultNonce
    );

    let action = [ACTION_TRANSFER_SOL];
    let amount = args.amount.to_le_bytes();
    let vault_nonce = args.vault_nonce.to_le_bytes();
    let expires_at = args.proof_expires_at.to_le_bytes();
    let expected_challenge = challenge(&[
        ctx.accounts.config.cluster_domain.as_ref(),
        crate::ID.as_ref(),
        action.as_ref(),
        ctx.accounts.config.key().as_ref(),
        ctx.accounts.vault.key().as_ref(),
        ctx.accounts.recipient.key().as_ref(),
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
    transfer_program_lamports(
        &ctx.accounts.vault.to_account_info(),
        &ctx.accounts.recipient.to_account_info(),
        args.amount,
        VeriAgentError::InsufficientVaultLamports,
    )
}

pub(crate) fn transfer_program_lamports<'info>(
    source: &AccountInfo<'info>,
    destination: &AccountInfo<'info>,
    amount: u64,
    insufficient_error: VeriAgentError,
) -> Result<()> {
    let rent_reserve = Rent::get()?.minimum_balance(source.data_len());
    let remaining = source
        .lamports()
        .checked_sub(amount)
        .ok_or_else(|| error!(insufficient_error))?;
    if remaining < rent_reserve {
        return Err(insufficient_error.into());
    }
    let destination_balance = destination
        .lamports()
        .checked_add(amount)
        .ok_or_else(|| error!(VeriAgentError::ArithmeticOverflow))?;
    **source.try_borrow_mut_lamports()? = remaining;
    **destination.try_borrow_mut_lamports()? = destination_balance;
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn sol_transfer_challenge_matches_client_fixture() {
        let cluster = [1; 32];
        let program = Pubkey::new_from_array([2; 32]);
        let config = Pubkey::new_from_array([3; 32]);
        let vault = Pubkey::new_from_array([4; 32]);
        let recipient = Pubkey::new_from_array([5; 32]);
        let action = [ACTION_TRANSFER_SOL];
        let amount = 1_000_000_000u64.to_le_bytes();
        let nonce = 7u64.to_le_bytes();
        let expiry = 1_800_000_000i64.to_le_bytes();
        let actual = challenge(&[
            cluster.as_ref(),
            program.as_ref(),
            action.as_ref(),
            config.as_ref(),
            vault.as_ref(),
            recipient.as_ref(),
            amount.as_ref(),
            nonce.as_ref(),
            expiry.as_ref(),
        ]);
        assert_eq!(actual, [119, 2, 182, 28, 212, 134, 218, 107, 60, 52, 248, 115, 5, 193, 41, 165, 215, 43, 63, 239, 177, 66, 100, 77, 147, 194, 241, 167, 192, 6, 29, 110]);
    }
}