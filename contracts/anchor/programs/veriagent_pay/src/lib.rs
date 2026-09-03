use anchor_lang::prelude::*;

pub mod auth;
pub mod constants;
pub mod errors;
pub mod payment_links;
pub mod protocol;
pub mod state;
pub mod wallet;

use protocol::*;
use payment_links::*;
use wallet::*;

#[cfg(not(feature = "tunnel-program"))]
declare_id!("AJirAN6RarZXyHWfYLSFB6NUCbFG3RaKDXMCDueRi7uV");
#[cfg(feature = "tunnel-program")]
declare_id!("HYnWswyU79GMX6s4kYDGBa6qQGc5JiJL9rQw37Q6bZJi");

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

    pub fn initialize_claim_authority(
        ctx: Context<InitializeClaimAuthority>,
        args: InitializeClaimAuthorityArgs,
    ) -> Result<()> {
        payment_links::initialize_claim_authority(ctx, args)
    }

    pub fn create_payment_link_with_session(
        ctx: Context<CreatePaymentLinkWithSession>,
        args: CreatePaymentLinkWithSessionArgs,
    ) -> Result<()> {
        payment_links::create_payment_link_with_session(ctx, args)
    }

    pub fn claim_payment_link(ctx: Context<ClaimPaymentLink>) -> Result<()> {
        payment_links::claim_payment_link(ctx)
    }

    pub fn cancel_payment_link_with_session(
        ctx: Context<CancelPaymentLinkWithSession>,
        args: CancelPaymentLinkWithSessionArgs,
    ) -> Result<()> {
        payment_links::cancel_payment_link_with_session(ctx, args)
    }

    pub fn refund_expired_payment_link(ctx: Context<RefundExpiredPaymentLink>) -> Result<()> {
        payment_links::refund_expired_payment_link(ctx)
    }
}