import hre from "hardhat";

async function main() {
  // Check if PRIVATE_KEY is set in environment
  if (!process.env.PRIVATE_KEY) {
    throw new Error("PRIVATE_KEY environment variable is required");
  }

  const PROXY_ADDRESS = process.env.PROXY_ADDRESS;
  if (!PROXY_ADDRESS) {
    throw new Error("PROXY_ADDRESS environment variable is required");
  }

  const TIMELOCK_ADDRESS = process.env.TIMELOCK_ADDRESS;
  if (!TIMELOCK_ADDRESS) {
    throw new Error("TIMELOCK_ADDRESS environment variable is required");
  }

  const [deployer] = await hre.ethers.getSigners();
  console.log("Deployer:", deployer.address);

  console.log("\n=== Current Contract State ===");
  const Piggycell = await hre.ethers.getContractAt("Piggycell", PROXY_ADDRESS);
  
  const currentOwner = await Piggycell.owner();
  console.log("Current Owner:", currentOwner);
  console.log("Timelock Address:", TIMELOCK_ADDRESS);

  // Verify that deployer is the current owner
  if (currentOwner.toLowerCase() !== deployer.address.toLowerCase()) {
    throw new Error(
      `Deployer (${deployer.address}) is not the current owner (${currentOwner}). ` +
      "Only the owner can transfer ownership."
    );
  }

  // Verify timelock is a contract
  const timelockCode = await hre.ethers.provider.getCode(TIMELOCK_ADDRESS);
  if (timelockCode === "0x") {
    throw new Error(`Timelock address ${TIMELOCK_ADDRESS} is not a contract`);
  }

  console.log("\n=== Transferring Ownership to TimelockController ===");
  console.log("⚠️  WARNING: This will transfer ownership to the timelock.");
  console.log("After this, upgrades can only be performed through the timelock with a delay.");

  // Transfer ownership
  const tx = await Piggycell.transferOwnership(TIMELOCK_ADDRESS);
  console.log("Transaction hash:", tx.hash);
  console.log("Waiting for confirmation...");
  
  const receipt = await tx.wait();
  console.log("Transaction confirmed in block:", receipt.blockNumber);

  // Verify ownership transfer
  const newOwner = await Piggycell.owner();
  console.log("\n=== Ownership Transfer Complete ===");
  console.log("New Owner:", newOwner);
  
  if (newOwner.toLowerCase() !== TIMELOCK_ADDRESS.toLowerCase()) {
    throw new Error("Ownership transfer failed!");
  }

  console.log("\n✅ Ownership successfully transferred to TimelockController");
  console.log("\n=== Next Steps ===");
  console.log("To upgrade the contract, use upgrade-via-timelock.js script");
  console.log("The upgrade will be scheduled and executed after the timelock delay period.");

  return {
    proxyAddress: PROXY_ADDRESS,
    timelockAddress: TIMELOCK_ADDRESS,
    previousOwner: currentOwner,
    newOwner: newOwner,
    transactionHash: tx.hash,
  };
}

main()
  .then((result) => {
    console.log("\n=== Transfer Summary ===");
    console.log(JSON.stringify(result, null, 2));
    process.exit(0);
  })
  .catch((error) => {
    console.error("Error:", error);
    process.exit(1);
  });

