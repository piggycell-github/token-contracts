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

  const NEW_IMPLEMENTATION = process.env.NEW_IMPLEMENTATION;
  if (!NEW_IMPLEMENTATION) {
    throw new Error("NEW_IMPLEMENTATION environment variable is required");
  }

  const [deployer] = await hre.ethers.getSigners();
  console.log("Deployer:", deployer.address);

  console.log("\n=== Upgrade Configuration ===");
  console.log("Proxy Address:", PROXY_ADDRESS);
  console.log("Timelock Address:", TIMELOCK_ADDRESS);
  console.log("New Implementation:", NEW_IMPLEMENTATION);

  // Verify timelock is the owner
  const Piggycell = await hre.ethers.getContractAt("Piggycell", PROXY_ADDRESS);
  const owner = await Piggycell.owner();
  
  if (owner.toLowerCase() !== TIMELOCK_ADDRESS.toLowerCase()) {
    throw new Error(
      `Timelock (${TIMELOCK_ADDRESS}) is not the owner. ` +
      `Current owner is ${owner}. Please transfer ownership first using transfer-to-timelock.js.`
    );
  }

  // Verify new implementation is a contract
  const implCode = await hre.ethers.provider.getCode(NEW_IMPLEMENTATION);
  if (implCode === "0x") {
    throw new Error(`New implementation address ${NEW_IMPLEMENTATION} is not a contract`);
  }

  // Get timelock contract
  const TimelockController = await hre.ethers.getContractAt(
    "TimelockController",
    TIMELOCK_ADDRESS
  );

  // Get min delay
  const minDelay = await TimelockController.getMinDelay();
  console.log("Timelock Min Delay:", minDelay.toString(), "seconds (" + (Number(minDelay) / 3600) + " hours)");

  // Prepare upgrade calldata
  // UUPS upgrade uses upgradeToAndCall(address,bytes)
  const PiggycellFactory = await hre.ethers.getContractFactory("Piggycell");
  const calldata = PiggycellFactory.interface.encodeFunctionData("upgradeToAndCall", [
    NEW_IMPLEMENTATION,
    "0x" // empty bytes
  ]);

  console.log("\n=== Scheduling Upgrade ===");
  console.log("Target:", PROXY_ADDRESS);
  console.log("Calldata:", calldata);

  // Generate salt for the operation
  const salt = hre.ethers.id("upgrade-" + Date.now() + "-" + Math.random());

  // Calculate execution time
  const currentBlock = await hre.ethers.provider.getBlockNumber();
  const currentBlockTime = (await hre.ethers.provider.getBlock(currentBlock)).timestamp;
  const executeTime = BigInt(currentBlockTime) + minDelay;

  console.log("\n⚠️  Scheduling upgrade transaction...");
  console.log("This will schedule the upgrade to execute after", minDelay.toString(), "seconds");

  // Schedule the operation
  const tx = await TimelockController.schedule(
    PROXY_ADDRESS,
    0, // value
    calldata,
    hre.ethers.ZeroHash, // predecessor (no dependency)
    salt,
    minDelay
  );

  console.log("Transaction hash:", tx.hash);
  console.log("Waiting for confirmation...");
  
  const receipt = await tx.wait();
  console.log("Transaction confirmed in block:", receipt.blockNumber);

  // Get the operation ID
  const operationId = await TimelockController.hashOperation(
    PROXY_ADDRESS,
    0,
    calldata,
    hre.ethers.ZeroHash,
    salt
  );

  console.log("\n=== Upgrade Scheduled ===");
  console.log("Operation ID:", operationId);
  console.log("Scheduled execution time:", new Date(Number(executeTime) * 1000).toISOString());
  console.log("Delay:", minDelay.toString(), "seconds (" + (Number(minDelay) / 3600) + " hours)");

  console.log("\n=== Next Steps ===");
  console.log("1. Wait for the delay period (" + (Number(minDelay) / 3600) + " hours)");
  console.log("2. After the delay, execute the upgrade using:");
  console.log(`   npx hardhat run scripts/execute-timelock.js --network ${hre.network.name}`);
  console.log("   (Set OPERATION_ID, PROXY_ADDRESS, NEW_IMPLEMENTATION, and SALT environment variables)");
  console.log("\nOr execute directly using:");
  console.log(`   await TimelockController.execute(${PROXY_ADDRESS}, 0, ${calldata}, ${hre.ethers.ZeroHash}, ${salt})`);

  // Save operation details for later execution
  console.log("\n=== Save these values for execution ===");
  console.log("OPERATION_ID=" + operationId);
  console.log("PROXY_ADDRESS=" + PROXY_ADDRESS);
  console.log("NEW_IMPLEMENTATION=" + NEW_IMPLEMENTATION);
  console.log("SALT=" + salt);

  return {
    operationId,
    proxyAddress: PROXY_ADDRESS,
    newImplementation: NEW_IMPLEMENTATION,
    timelockAddress: TIMELOCK_ADDRESS,
    minDelay: minDelay.toString(),
    executeTime: executeTime.toString(),
    salt: salt,
    transactionHash: tx.hash,
  };
}

main()
  .then((result) => {
    console.log("\n=== Schedule Summary ===");
    console.log(JSON.stringify(result, null, 2));
    process.exit(0);
  })
  .catch((error) => {
    console.error("Error:", error);
    process.exit(1);
  });

