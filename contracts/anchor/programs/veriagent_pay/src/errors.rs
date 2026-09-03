use anchor_lang::prelude::*;

#[error_code]
pub enum VeriAgentError {
    #[msg("The protocol is paused")]
    ProtocolPaused,
    #[msg("The configured stablecoin mint is invalid")]
    InvalidStablecoinMint,
    #[msg("The supplied root key hash does not match the public key")]
    InvalidRootKeyHash,
    #[msg("The authorization has expired or is too far in the future")]
    InvalidAuthorizationExpiry,
    #[msg("The vault authorization nonce is invalid")]
    InvalidVaultNonce,
    #[msg("The session authorization nonce is invalid")]
    InvalidSessionNonce,
    #[msg("The secp256r1 verification instruction is missing")]
    MissingSecp256r1Instruction,
    #[msg("The secp256r1 verification instruction is not canonical")]
    InvalidSecp256r1Instruction,
    #[msg("The secp256r1 verification public key is invalid")]
    InvalidSecp256r1PublicKey,
    #[msg("The secp256r1 verification message is invalid")]
    InvalidSecp256r1Message,
    #[msg("The authenticator data is malformed")]
    InvalidAuthenticatorData,
    #[msg("The relying-party ID hash is invalid")]
    InvalidRpIdHash,
    #[msg("User presence and verification are required")]
    UserVerificationRequired,
    #[msg("The WebAuthn client data is malformed")]
    InvalidClientData,
    #[msg("The WebAuthn ceremony type is invalid")]
    InvalidWebAuthnType,
    #[msg("Cross-origin WebAuthn assertions are not accepted")]
    CrossOriginAssertion,
    #[msg("The WebAuthn origin is invalid")]
    InvalidWebAuthnOrigin,
    #[msg("The WebAuthn challenge is invalid")]
    InvalidWebAuthnChallenge,
    #[msg("The session validity window is invalid")]
    InvalidSessionWindow,
    #[msg("The session action policy is invalid")]
    InvalidSessionActions,
    #[msg("The session spending limits are invalid")]
    InvalidSessionLimits,
    #[msg("The session is revoked")]
    SessionRevoked,
    #[msg("The session is not currently active")]
    SessionInactive,
    #[msg("The session does not authorize this action")]
    SessionActionDenied,
    #[msg("The transfer exceeds the per-action limit")]
    PerActionLimitExceeded,
    #[msg("The transfer exceeds the cumulative session limit")]
    CumulativeLimitExceeded,
    #[msg("Arithmetic overflow")]
    ArithmeticOverflow,
    #[msg("The transfer amount must be greater than zero")]
    InvalidTransferAmount,
    #[msg("The source and destination token accounts must differ")]
    IdenticalTokenAccounts,
    #[msg("The payment-link expiry is invalid")]
    InvalidPaymentLinkExpiry,
    #[msg("The payment-link recipient commitment is invalid")]
    InvalidRecipientCommitment,
    #[msg("The payment link is no longer active")]
    PaymentLinkNotActive,
    #[msg("The payment link has expired")]
    PaymentLinkExpired,
    #[msg("The payment link has not expired")]
    PaymentLinkNotExpired,
    #[msg("The payment link does not belong to this vault")]
    InvalidPaymentLinkSender,
    #[msg("The payment-link claim authority is invalid")]
    InvalidClaimAuthority,
    #[msg("The vault does not have enough spendable SOL after rent")]
    InsufficientVaultLamports,
    #[msg("The payment-link account does not have enough escrowed SOL")]
    InsufficientEscrowLamports,
    #[msg("The source and destination accounts must differ")]
    IdenticalAccounts,
    #[msg("The payment link is not a native SOL escrow")]
    InvalidNativePaymentLink,
}