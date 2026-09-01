const { ethers } = require('ethers');

async function debugVaultDeployment() {
  const provider = new ethers.JsonRpcProvider('https://rpc.bohr.life/');

  const txHash = '0x7ffb2a5aaec5e259a7147806a275f306c574cf279774fe1b9c9c68271286671a';

  console.log('🔍 Debugging vault deployment transaction...\n');
  console.log('Transaction Hash:', txHash);

  const receipt = await provider.getTransactionReceipt(txHash);

  console.log('\n📊 Transaction Receipt:');
  console.log('Status:', receipt.status === 1 ? '✅ Success' : '❌ Failed');
  console.log('Gas Used:', receipt.gasUsed.toString());
  console.log('Logs Count:', receipt.logs.length);

  console.log('\n📝 Event Logs:');
  const eventSignature = ethers.id('VaultCreated(address,bytes32,address)');

  receipt.logs.forEach((log, index) => {
    console.log(`\nLog #${index}:`);
    console.log('  Address:', log.address);
    console.log('  Topic[0]:', log.topics[0]);

    if (log.topics[0] === eventSignature) {
      console.log('  ✅ This is VaultCreated event!');
      console.log('  Topic[1] (vault):', log.topics[1]);

      // Old method (WRONG)
      const oldExtraction = '0x' + log.topics[1].slice(26);
      console.log('  ❌ Old extraction (slice(26)):', oldExtraction);

      // New method (CORRECT)
      const newExtraction = '0x' + log.topics[1].slice(-40);
      console.log('  ✅ New extraction (slice(-40)):', newExtraction);

      try {
        const vaultAddress = ethers.getAddress(newExtraction);
        console.log('  ✅ Valid address:', vaultAddress);
      } catch (err) {
        console.log('  ❌ Invalid address:', err.message);
      }
    }
  });

  console.log('\n🔍 Checking bytecode at addresses:');

  // Check the address that was reported
  const reportedAddress = '0x40EC2Acc7098a4C96F0910ba7Ea9A5Fa8A2cd583';
  const code = await provider.getCode(reportedAddress);
  console.log(`\nReported address: ${reportedAddress}`);
  console.log('Bytecode:', code === '0x' ? '❌ No bytecode (empty)' : `✅ Has bytecode (${code.length} bytes)`);

  // Check if there's a VaultCreated event and check that address
  const vaultCreatedLog = receipt.logs.find(log => log.topics[0] === eventSignature);
  if (vaultCreatedLog) {
    const actualVaultAddress = ethers.getAddress('0x' + vaultCreatedLog.topics[1].slice(-40));
    console.log(`\nActual vault address from event: ${actualVaultAddress}`);
    const actualCode = await provider.getCode(actualVaultAddress);
    console.log('Bytecode:', actualCode === '0x' ? '❌ No bytecode (empty)' : `✅ Has bytecode (${actualCode.length} bytes)`);
  }
}

debugVaultDeployment().catch(console.error);
