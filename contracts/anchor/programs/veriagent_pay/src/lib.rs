use anchor_lang::prelude::*;

pub mod auth;
pub mod constants;
pub mod errors;
pub mod protocol;
pub mod state;
pub mod wallet;

use protocol::*;
use wallet::*;

declare_id!("9QQaAmTaW6FR3q8qYnAoCFr8kcmKwPE99terRZ95txmR");

#[program]
pub mod veriagent_pay {
    use super::*;

    pub fn initialize_protocol(
        ctx: Context<InitializeProtocol>,
        args: InitializeProtocolArgs,
    ) -> Result<()> {
        protocol::initialize_protocol(ctx, args)
    }

    pub fn initialize_vault(
        ctx: Context<InitializeVault>,
        args: InitializeVaultArgs,
    ) -> Result<()> {
        wallet::initialize_vault(ctx, args)
    }

    pub fn grant_session(ctx: Context<GrantSession>, args: GrantSessionArgs) -> Result<()> {
        wallet::grant_session(ctx, args)
    }

    pub fn initialize_vault_and_grant_session(
        ctx: Context<InitializeVaultAndGrantSession>,
        args: InitializeVaultAndGrantSessionArgs,
    ) -> Result<()> {
        wallet::initialize_vault_and_grant_session(ctx, args)
    }

    pub fn transfer_with_passkey(
        ctx: Context<TransferWithPasskey>,
        args: PasskeyTransferArgs,
    ) -> Result<()> {
        wallet::transfer_with_passkey(ctx, args)
    }

    pub fn transfer_with_session(
        ctx: Context<TransferWithSession>,
        args: SessionTransferArgs,
    ) -> Result<()> {
        wallet::transfer_with_session(ctx, args)
    }
}