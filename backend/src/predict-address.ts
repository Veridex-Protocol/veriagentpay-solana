import * as dotenv from 'dotenv';
import * as path from 'path';
dotenv.config({ path: path.resolve(__dirname, '../.env') });

import { ethers } from 'ethers';
import { createBotChainProvider } from './common/rpc-provider.helper';

const provider = createBotChainProvider();
const factoryAddress = process.env.PAY_VAULT_FACTORY_ADDRESS || '0x10D31299d90FF860a92Bf3206fcDAdf5AF2d084d';

const factoryAbi = [
  'function getAddress(bytes32 ownerKeyHash) view returns (address)'
];

async function main() {
  const factory = new ethers.Contract(factoryAddress, factoryAbi, provider);

  // uncharted1 wallet details in DB
  const pubKeyX = '0x0';
  const pubKeyY = '0x0';

  // Hash method 1: ABI encoded uint256
  const ownerKeyHash1 = ethers.keccak256(
    ethers.AbiCoder.defaultAbiCoder().encode(['uint256', 'uint256'], [BigInt(pubKeyX), BigInt(pubKeyY)])
  );
  
  // Hash method 2: Solidity packed strings
  const ownerKeyHash2 = ethers.keccak256(
    ethers.solidityPacked(['string', 'string'], [pubKeyX, pubKeyY])
  );

  const addr1 = await ((factory as any).getAddress)(ownerKeyHash1).catch((e: any) => e.message);
  const addr2 = await ((factory as any).getAddress)(ownerKeyHash2).catch((e: any) => e.message);

  console.log(`Factory: ${factoryAddress}`);
  console.log(`Hash 1 (ABI Coder): ${ownerKeyHash1} -> Predicted Address: ${addr1}`);
  console.log(`Hash 2 (Packed Strings): ${ownerKeyHash2} -> Predicted Address: ${addr2}`);
  console.log(`Target database address: 0x9EE315bf057C60b67f0D7457B6CaA78320DC68A8`);
}

main().catch(console.error);
