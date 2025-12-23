import hre from "hardhat";

async function main() {
  // Check if PRIVATE_KEY is set in environment
  if (!process.env.PRIVATE_KEY) {
    throw new Error("PRIVATE_KEY environment variable is required");
  }

  const TIMELOCK_ADDRESS = process.env.TIMELOCK_ADDRESS;
  if (!TIMELOCK_ADDRESS) {
    throw new Error("TIMELOCK_ADDRESS environment variable is required");
  }

  const PROXY_ADDRESS = process.env.PROXY_ADDRESS;
  if (!PROXY_ADDRESS) {
    throw new Error("PROXY_ADDRESS environment variable is required");
  }

  const NEW_IMPLEMENTATION = process.env.NEW_IMPLEMENTATION;
  if (!NEW_IMPLEMENTATION) {
    throw new Error("NEW_IMPLEMENTATION environment variable is required");
  }

  const SALT = process.env.SALT;
  if (!SALT) {
    throw new Error("SALT environment variable is required");
  }

  const [deployer] = await hre.ethers.getSigners();
  console.log("Deployer:", deployer.address);

  console.log("\n=== Execute Timelock Operation ===");
  console.log("Timelock Address:", TIMELOCK_ADDRESS);
  console.log("Proxy Address:", PROXY_ADDRESS);
  console.log("New Implementation:", NEW_IMPLEMENTATION);
  console.log("Salt:", SALT);

  const TimelockController = await hre.ethers.getContractAt(
    "TimelockController",
    TIMELOCK_ADDRESS
  );

  // Prepare upgrade calldata (same as when scheduling)
  const PiggycellFactory = await hre.ethers.getContractFactory("Piggycell");
  const calldata = PiggycellFactory.interface.encodeFunctionData("upgradeToAndCall", [
    NEW_IMPLEMENTATION,
    "0x"
  ]);

  // Get operation ID
  const operationId = await TimelockController.hashOperation(
    PROXY_ADDRESS,
    0,
    calldata,
    hre.ethers.ZeroHash,
    SALT
  );

  console.log("Operation ID:", operationId);

  // Check if operation is ready
  const isReady = await TimelockController.isOperationReady(operationId);
  const isPending = await TimelockController.isOperationPending(operationId);
  const isDone = await TimelockController.isOperationDone(operationId);

  console.log("\n=== Operation Status ===");
  console.log("Is Pending:", isPending);
  console.log("Is Ready:", isReady);
  console.log("Is Done:", isDone);

  if (isDone) {
    console.log("\n✅ Operation has already been executed.");
    return;
  }

  if (!isReady) {
    if (isPending) {
      const timestamp = await TimelockController.getTimestamp(operationId);
      const currentTime = BigInt(Math.floor(Date.now() / 1000));
      const remaining = timestamp > currentTime ? timestamp - currentTime : 0n;
      
      console.log("\n⏳ Operation is pending but not ready yet.");
      console.log("Scheduled timestamp:", timestamp.toString());
      console.log("Current timestamp:", currentTime.toString());
      console.log("Remaining time:", remaining.toString(), "seconds (" + (Number(remaining) / 3600) + " hours)");
      throw new Error("Operation is not ready to execute yet. Please wait for the delay period.");
    } else {
      throw new Error("Operation is not pending. It may not exist or may have been cancelled.");
    }
  }

  console.log("\n=== Executing Operation ===");
  console.log("Target:", PROXY_ADDRESS);
  console.log("Calldata:", calldata);

  const tx = await TimelockController.execute(
    PROXY_ADDRESS,
    0,
    calldata,
    hre.ethers.ZeroHash,
    SALT
  );

  console.log("Transaction hash:", tx.hash);
  console.log("Waiting for confirmation...");
  
  const receipt = await tx.wait();
  console.log("Transaction confirmed in block:", receipt.blockNumber);
  console.log("\n✅ Operation executed successfully!");

  // Verify the upgrade
  const Piggycell = await hre.ethers.getContractAt("Piggycell", PROXY_ADDRESS);
  const implementationSlot = "0x360894a13ba1a3210667c828492db98dca3e2076cc3735a920a3ca505d382bbc";
  const implementationAddress = await hre.ethers.provider.getStorage(PROXY_ADDRESS, implementationSlot);
  const actualImplementation = "0x" + implementationAddress.slice(26); // Remove padding
  
  console.log("\n=== Verification ===");
  console.log("Expected Implementation:", NEW_IMPLEMENTATION);
  console.log("Actual Implementation:", actualImplementation);
  
  if (actualImplementation.toLowerCase() === NEW_IMPLEMENTATION.toLowerCase()) {
    console.log("✅ Upgrade verified successfully!");
  } else {
    console.log("⚠️  Warning: Implementation address mismatch. Please verify manually.");
  }

  return {
    operationId: operationId,
    timelockAddress: TIMELOCK_ADDRESS,
    proxyAddress: PROXY_ADDRESS,
    newImplementation: NEW_IMPLEMENTATION,
    executed: true,
    transactionHash: tx.hash,
  };
}

main()
  .then((result) => {
    console.log("\n=== Execution Summary ===");
    console.log(JSON.stringify(result, null, 2));
    process.exit(0);
  })
  .catch((error) => {
    console.error("Error:", error);
    process.exit(1);
  });

