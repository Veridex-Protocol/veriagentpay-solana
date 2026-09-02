import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import {
  Connection,
  Keypair,
  PublicKey,
  SystemProgram,
  Transaction,
  TransactionInstruction,
  sendAndConfirmTransaction,
} from "@solana/web3.js";
import {
  SOLANA_DEVNET_USDC_MINT,
  VERIAGENT_PROGRAM_ID,
  clusterDomainFromGenesisHash,
  deriveProtocolConfig,
} from "@veriagent/chain-solana";

const rpcUrl = process.env.SOLANA_RPC_URL || "https://api.devnet.solana.com";
const keypairPath = process.env.SOLANA_DEPLOYER_KEYPAIR || ".keys/devnet-deployer.json";
const rpId = process.env.RP_ID || "veriagentpay.xyz";
const origin = process.env.WEBAUTHN_ORIGIN || "https://veriagentpay.xyz";
const programId = new PublicKey(
  process.env.SOLANA_PROGRAM_ID || VERIAGENT_PROGRAM_ID,
);

const connection = new Connection(rpcUrl, "confirmed");
const payer = Keypair.fromSecretKey(
  Uint8Array.from(JSON.parse(await readFile(keypairPath, "utf8")) as number[]),
);
const genesisHash = await connection.getGenesisHash();
const configAddress = deriveProtocolConfig(programId);
const expected = {
  authority: payer.publicKey,
  stablecoinMint: SOLANA_DEVNET_USDC_MINT,
  rpIdHash: sha256(rpId),
  originHash: sha256(origin),
  clusterDomain: clusterDomainFromGenesisHash(genesisHash),
};

const existing = await connection.getAccountInfo(configAddress, "confirmed");
if (existing) {
  verifyConfig(existing.owner, existing.data, expected);
  console.log(JSON.stringify({
    status: "already-initialized",
    programId: programId.toBase58(),
    configAddress: configAddress.toBase58(),
    authority: payer.publicKey.toBase58(),
    stablecoinMint: SOLANA_DEVNET_USDC_MINT.toBase58(),
    genesisHash,
    rpId,
    origin,
  }, null, 2));
  process.exit(0);
}

const discriminator = createHash("sha256")
  .update("global:initialize_protocol")
  .digest()
  .subarray(0, 8);
const instruction = new TransactionInstruction({
  programId,
  keys: [
    { pubkey: payer.publicKey, isSigner: true, isWritable: true },
    { pubkey: configAddress, isSigner: false, isWritable: true },
    { pubkey: SOLANA_DEVNET_USDC_MINT, isSigner: false, isWritable: false },
    { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
  ],
  data: Buffer.concat([
    discriminator,
    Buffer.from(expected.rpIdHash),
    Buffer.from(expected.originHash),
    Buffer.from(expected.clusterDomain),
  ]),
});
const signature = await sendAndConfirmTransaction(
  connection,
  new Transaction().add(instruction),
  [payer],
  { commitment: "confirmed", preflightCommitment: "confirmed" },
);
const initialized = await connection.getAccountInfo(configAddress, "confirmed");
if (!initialized) throw new Error("Protocol config account is missing after confirmation");
verifyConfig(initialized.owner, initialized.data, expected);

console.log(JSON.stringify({
  status: "initialized",
  signature,
  programId: programId.toBase58(),
  configAddress: configAddress.toBase58(),
  authority: payer.publicKey.toBase58(),
  stablecoinMint: SOLANA_DEVNET_USDC_MINT.toBase58(),
  genesisHash,
  rpId,
  origin,
}, null, 2));

function sha256(value: string): Uint8Array {
  return new Uint8Array(createHash("sha256").update(value).digest());
}

function verifyConfig(
  owner: PublicKey,
  data: Buffer,
  values: typeof expected,
): void {
  if (!owner.equals(programId)) throw new Error("Protocol config has the wrong owner");
  if (data.length < 171) throw new Error("Protocol config data is truncated");
  if (data[8] !== 1 || data[10] !== 0) throw new Error("Protocol config version or pause state is invalid");
  assertBytes(data.subarray(11, 43), values.authority.toBytes(), "authority");
  assertBytes(data.subarray(43, 75), values.stablecoinMint.toBytes(), "stablecoin mint");
  assertBytes(data.subarray(75, 107), values.rpIdHash, "RP ID hash");
  assertBytes(data.subarray(107, 139), values.originHash, "origin hash");
  assertBytes(data.subarray(139, 171), values.clusterDomain, "cluster domain");
}

function assertBytes(actual: Uint8Array, expectedBytes: Uint8Array, label: string): void {
  if (!Buffer.from(actual).equals(Buffer.from(expectedBytes))) {
    throw new Error(`Protocol config ${label} does not match expected value`);
  }
}