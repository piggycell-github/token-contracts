import pkg from "hardhat";
const { ethers } = pkg;

/**
 * Deploy PiggyBulkTransfer contract
 *
 * Usage:
 * npx hardhat run scripts/deploy-bulk-transfer.js --network bsc_testnet
 * npx hardhat run scripts/deploy-bulk-transfer.js --network bsc_mainnet
 */

async function main() {
  console.log("=".repeat(60));
  console.log("Deploying PiggyBulkTransfer Contract");
  console.log("=".repeat(60));

  const [deployer] = await ethers.getSigners();
  console.log(`\nDeployer: ${deployer.address}`);

  const balance = await ethers.provider.getBalance(deployer.address);
  console.log(`Balance: ${ethers.formatEther(balance)} BNB`);

  // Deploy contract
  console.log("\nDeploying PiggyBulkTransfer...");

  const PiggyBulkTransfer = await ethers.getContractFactory("PiggyBulkTransfer");
  const bulkTransfer = await PiggyBulkTransfer.deploy();

  await bulkTransfer.waitForDeployment();
  const contractAddress = await bulkTransfer.getAddress();

  console.log(`\nPiggyBulkTransfer deployed to: ${contractAddress}`);

  // Verify deployment
  const owner = await bulkTransfer.owner();
  const maxRecipients = await bulkTransfer.MAX_RECIPIENTS();

  console.log(`Owner: ${owner}`);
  console.log(`Max recipients per batch: ${maxRecipients}`);

  // Get recommended batch sizes
  const [recNew, maxNew] = await bulkTransfer.getRecommendedBatchSize(true);
  const [recExisting, maxExisting] = await bulkTransfer.getRecommendedBatchSize(false);

  console.log("\nRecommended batch sizes:");
  console.log(`  New holders: ${recNew} (max: ${maxNew})`);
  console.log(`  Existing holders: ${recExisting} (max: ${maxExisting})`);

  console.log("\n" + "=".repeat(60));
  console.log("Deployment Complete!");
  console.log("=".repeat(60));

  console.log(`
Next steps:
1. Add to .env:
   BULK_TRANSFER_ADDRESS=${contractAddress}

2. Create recipients.csv with format:
   address,amount
   0x123...,100
   0x456...,200

3. Run bulk transfer:
   npx hardhat run scripts/bulk-transfer.js --network bsc_mainnet
`);

  // For verification
  console.log("\nFor contract verification:");
  console.log(`npx hardhat verify --network <network> ${contractAddress}`);
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
