use anchor_lang::{
    prelude::*,
    solana_program::{
        hash::{hash, hashv},
        instruction::Instruction,
        sysvar::instructions::{load_current_index_checked, load_instruction_at_checked},
    },
};
use base64ct::{Base64UrlUnpadded, Encoding};
use serde::Deserialize;

use crate::{
    constants::{
        CHALLENGE_DOMAIN, MAX_AUTHORIZATION_TTL_SECONDS, SECP256R1_PROGRAM_ID,
    },
    errors::VeriAgentError,
    state::ProtocolConfig,
};

const SECP256R1_DATA_START: usize = 16;
const COMPRESSED_PUBLIC_KEY_SIZE: usize = 33;
const COMPACT_SIGNATURE_SIZE: usize = 64;
const AUTHENTICATOR_DATA_MIN_SIZE: usize = 37;
const USER_PRESENT_FLAG: u8 = 1 << 0;
const USER_VERIFIED_FLAG: u8 = 1 << 2;

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct CollectedClientData {
    #[serde(rename = "type")]
    ceremony_type: String,
    challenge: String,
    origin: String,
    cross_origin: Option<bool>,
}

pub struct RootAuthorization<'a> {
    pub root_public_key: &'a [u8; 33],
    pub authenticator_data: &'a [u8],
    pub client_data_json: &'a [u8],
    pub expected_challenge: [u8; 32],
    pub expires_at: i64,
}

pub fn verify_root_authorization(
    config: &ProtocolConfig,
    instructions_sysvar: &AccountInfo<'_>,
    clock: &Clock,
    authorization: RootAuthorization<'_>,
) -> Result<()> {
    validate_authorization_expiry(clock.unix_timestamp, authorization.expires_at)?;
    validate_webauthn_data(
        config,
        authorization.authenticator_data,
        authorization.client_data_json,
        &authorization.expected_challenge,
    )?;

    let mut signed_message = Vec::with_capacity(authorization.authenticator_data.len() + 32);
    signed_message.extend_from_slice(authorization.authenticator_data);
    signed_message.extend_from_slice(hash(authorization.client_data_json).as_ref());

    let current_index = load_current_index_checked(instructions_sysvar)?;
    require!(
        current_index > 0,
        VeriAgentError::MissingSecp256r1Instruction
    );
    let verification_instruction =
        load_instruction_at_checked(usize::from(current_index - 1), instructions_sysvar)?;

    validate_secp256r1_instruction(
        &verification_instruction,
        authorization.root_public_key,
        &signed_message,
    )
}

pub fn challenge(parts: &[&[u8]]) -> [u8; 32] {
    let mut values = Vec::with_capacity(parts.len() + 1);
    values.push(CHALLENGE_DOMAIN);
    values.extend_from_slice(parts);
    hashv(&values).to_bytes()
}

fn validate_authorization_expiry(now: i64, expires_at: i64) -> Result<()> {
    require!(
        expires_at >= now && expires_at <= now.saturating_add(MAX_AUTHORIZATION_TTL_SECONDS),
        VeriAgentError::InvalidAuthorizationExpiry
    );
    Ok(())
}

fn validate_webauthn_data(
    config: &ProtocolConfig,
    authenticator_data: &[u8],
    client_data_json: &[u8],
    expected_challenge: &[u8; 32],
) -> Result<()> {
    require!(
        authenticator_data.len() >= AUTHENTICATOR_DATA_MIN_SIZE,
        VeriAgentError::InvalidAuthenticatorData
    );
    require!(
        authenticator_data[..32] == config.rp_id_hash,
        VeriAgentError::InvalidRpIdHash
    );

    let flags = authenticator_data[32];
    require!(
        flags & (USER_PRESENT_FLAG | USER_VERIFIED_FLAG)
            == USER_PRESENT_FLAG | USER_VERIFIED_FLAG,
        VeriAgentError::UserVerificationRequired
    );

    let client_data: CollectedClientData = serde_json::from_slice(client_data_json)
        .map_err(|_| error!(VeriAgentError::InvalidClientData))?;
    require!(
        client_data.ceremony_type == "webauthn.get",
        VeriAgentError::InvalidWebAuthnType
    );
    require!(
        client_data.cross_origin != Some(true),
        VeriAgentError::CrossOriginAssertion
    );
    require!(
        hash(client_data.origin.as_bytes()).to_bytes() == config.origin_hash,
        VeriAgentError::InvalidWebAuthnOrigin
    );

    let decoded_challenge = Base64UrlUnpadded::decode_vec(&client_data.challenge)
        .map_err(|_| error!(VeriAgentError::InvalidWebAuthnChallenge))?;
    require!(
        decoded_challenge.as_slice() == expected_challenge,
        VeriAgentError::InvalidWebAuthnChallenge
    );

    Ok(())
}

fn validate_secp256r1_instruction(
    instruction: &Instruction,
    expected_public_key: &[u8; 33],
    expected_message: &[u8],
) -> Result<()> {
    require_keys_eq!(
        instruction.program_id,
        SECP256R1_PROGRAM_ID,
        VeriAgentError::MissingSecp256r1Instruction
    );
    require!(
        instruction.accounts.is_empty(),
        VeriAgentError::InvalidSecp256r1Instruction
    );

    let data = instruction.data.as_slice();
    require!(
        data.len() >= SECP256R1_DATA_START && data[0] == 1,
        VeriAgentError::InvalidSecp256r1Instruction
    );

    let signature_offset = read_u16(data, 2)?;
    let signature_instruction_index = read_u16(data, 4)?;
    let public_key_offset = read_u16(data, 6)?;
    let public_key_instruction_index = read_u16(data, 8)?;
    let message_offset = read_u16(data, 10)?;
    let message_size = read_u16(data, 12)?;
    let message_instruction_index = read_u16(data, 14)?;

    let expected_public_key_offset = SECP256R1_DATA_START;
    let expected_signature_offset = expected_public_key_offset + COMPRESSED_PUBLIC_KEY_SIZE;
    let expected_message_offset = expected_signature_offset + COMPACT_SIGNATURE_SIZE;
    require!(
        usize::from(public_key_offset) == expected_public_key_offset
            && usize::from(signature_offset) == expected_signature_offset
            && usize::from(message_offset) == expected_message_offset
            && usize::from(message_size) == expected_message.len()
            && signature_instruction_index == u16::MAX
            && public_key_instruction_index == u16::MAX
            && message_instruction_index == u16::MAX
            && data.len() == expected_message_offset + expected_message.len(),
        VeriAgentError::InvalidSecp256r1Instruction
    );

    let public_key = data
        .get(expected_public_key_offset..expected_signature_offset)
        .ok_or_else(|| error!(VeriAgentError::InvalidSecp256r1Instruction))?;
    require!(
        public_key == expected_public_key,
        VeriAgentError::InvalidSecp256r1PublicKey
    );

    let message = data
        .get(expected_message_offset..)
        .ok_or_else(|| error!(VeriAgentError::InvalidSecp256r1Instruction))?;
    require!(
        message == expected_message,
        VeriAgentError::InvalidSecp256r1Message
    );

    Ok(())
}

fn read_u16(data: &[u8], offset: usize) -> Result<u16> {
    let bytes: [u8; 2] = data
        .get(offset..offset + 2)
        .ok_or_else(|| error!(VeriAgentError::InvalidSecp256r1Instruction))?
        .try_into()
        .map_err(|_| error!(VeriAgentError::InvalidSecp256r1Instruction))?;
    Ok(u16::from_le_bytes(bytes))
}

#[cfg(test)]
mod tests {
    use super::*;
    use base64ct::Encoding;

    fn config(origin: &str, rp_id_hash: [u8; 32]) -> ProtocolConfig {
        ProtocolConfig {
            version: 1,
            bump: 1,
            paused: false,
            authority: Pubkey::new_unique(),
            stablecoin_mint: Pubkey::new_unique(),
            rp_id_hash,
            origin_hash: hash(origin.as_bytes()).to_bytes(),
            cluster_domain: [7; 32],
        }
    }

    fn precompile_instruction(public_key: [u8; 33], message: &[u8]) -> Instruction {
        let public_key_offset = SECP256R1_DATA_START;
        let signature_offset = public_key_offset + COMPRESSED_PUBLIC_KEY_SIZE;
        let message_offset = signature_offset + COMPACT_SIGNATURE_SIZE;
        let mut data = vec![1, 0];
        for value in [
            signature_offset as u16,
            u16::MAX,
            public_key_offset as u16,
            u16::MAX,
            message_offset as u16,
            message.len() as u16,
            u16::MAX,
        ] {
            data.extend_from_slice(&value.to_le_bytes());
        }
        data.extend_from_slice(&public_key);
        data.extend_from_slice(&[1; COMPACT_SIGNATURE_SIZE]);
        data.extend_from_slice(message);
        Instruction {
            program_id: SECP256R1_PROGRAM_ID,
            accounts: Vec::new(),
            data,
        }
    }

    #[test]
    fn validates_canonical_client_data() {
        let expected_challenge = [3; 32];
        let challenge = Base64UrlUnpadded::encode_string(&expected_challenge);
        let rp_id_hash = [9; 32];
        let mut authenticator_data = vec![0; AUTHENTICATOR_DATA_MIN_SIZE];
        authenticator_data[..32].copy_from_slice(&rp_id_hash);
        authenticator_data[32] = USER_PRESENT_FLAG | USER_VERIFIED_FLAG;
        let client_data = format!(
            r#"{{"type":"webauthn.get","challenge":"{challenge}","origin":"https://solana.veriagent.pay","crossOrigin":false}}"#
        );

        assert!(validate_webauthn_data(
            &config("https://solana.veriagent.pay", rp_id_hash),
            &authenticator_data,
            client_data.as_bytes(),
            &expected_challenge,
        )
        .is_ok());
    }

    #[test]
    fn rejects_wrong_challenge_and_cross_origin_assertions() {
        let rp_id_hash = [9; 32];
        let mut authenticator_data = vec![0; AUTHENTICATOR_DATA_MIN_SIZE];
        authenticator_data[..32].copy_from_slice(&rp_id_hash);
        authenticator_data[32] = USER_PRESENT_FLAG | USER_VERIFIED_FLAG;
        let encoded = Base64UrlUnpadded::encode_string(&[4; 32]);
        let wrong_challenge = format!(
            r#"{{"type":"webauthn.get","challenge":"{encoded}","origin":"https://solana.veriagent.pay"}}"#
        );
        assert!(validate_webauthn_data(
            &config("https://solana.veriagent.pay", rp_id_hash),
            &authenticator_data,
            wrong_challenge.as_bytes(),
            &[3; 32],
        )
        .is_err());

        let cross_origin = format!(
            r#"{{"type":"webauthn.get","challenge":"{encoded}","origin":"https://solana.veriagent.pay","crossOrigin":true}}"#
        );
        assert!(validate_webauthn_data(
            &config("https://solana.veriagent.pay", rp_id_hash),
            &authenticator_data,
            cross_origin.as_bytes(),
            &[4; 32],
        )
        .is_err());
    }

    #[test]
    fn validates_only_canonical_inline_precompile_data() {
        let public_key = [2; 33];
        let message = b"authenticator-data-and-client-hash";
        let mut instruction = precompile_instruction(public_key, message);
        assert!(validate_secp256r1_instruction(&instruction, &public_key, message).is_ok());

        instruction.data[8] = 0;
        assert!(validate_secp256r1_instruction(&instruction, &public_key, message).is_err());
    }
}