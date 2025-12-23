import hre from "hardhat";

async function main() {
  await hre.run("compile");

  // Check if PRIVATE_KEY is set in environment
  if (!process.env.PRIVATE_KEY) {
    throw new Error("PRIVATE_KEY environment variable is required for deployment");
  }

  const [deployer] = await hre.ethers.getSigners();
  console.log("Deployer:", deployer.address);

  const balance = await hre.ethers.provider.getBalance(deployer.address);
  console.log("Balance:", hre.ethers.formatEther(balance), "BNB");

  // Check if deployer has sufficient BNB
  if (balance === 0n) {
    throw new Error("Deployer wallet has no BNB. Please fund the wallet before deployment.");
  }

  // Time-lock configuration from environment variables
  // Proposers: addresses that can propose operations (usually multi-sig addresses)
  const proposersEnv = process.env.TIMELOCK_PROPOSERS;
  if (!proposersEnv) {
    throw new Error("TIMELOCK_PROPOSERS environment variable is required (comma-separated addresses)");
  }
  const proposers = proposersEnv.split(",").map(addr => addr.trim());

  // Executors: addresses that can execute operations (usually same as proposers)
  const executorsEnv = process.env.TIMELOCK_EXECUTORS || proposersEnv;
  const executors = executorsEnv.split(",").map(addr => addr.trim());

  // Admin: address that can manage the timelock (usually multi-sig or zero address to renounce)
  const admin = process.env.TIMELOCK_ADMIN || hre.ethers.ZeroAddress;

  // Min delay: 48 hours (172800 seconds) as recommended by Certik
  const minDelayEnv = process.env.TIMELOCK_MIN_DELAY;
  const minDelay = minDelayEnv ? parseInt(minDelayEnv) : 48 * 60 * 60; // 172800 seconds (48 hours)

  console.log("\n=== Time-lock Configuration ===");
  console.log("Min Delay:", minDelay, "seconds (" + (minDelay / 3600) + " hours)");
  console.log("Proposers:", proposers);
  console.log("Executors:", executors);
  console.log("Admin:", admin === hre.ethers.ZeroAddress ? "Zero Address (will renounce)" : admin);

  // Validate addresses
  for (const addr of [...proposers, ...executors]) {
    if (!hre.ethers.isAddress(addr)) {
      throw new Error(`Invalid address: ${addr}`);
    }
  }
  if (admin !== hre.ethers.ZeroAddress && !hre.ethers.isAddress(admin)) {
    throw new Error(`Invalid admin address: ${admin}`);
  }

  console.log("\n=== Deploying TimelockController ===");
  const TimelockController = await hre.ethers.getContractFactory(
    "@openzeppelin/contracts/governance/TimelockController.sol:TimelockController"
  );

  const timelock = await TimelockController.deploy(
    minDelay,
    proposers,
    executors,
    admin
  );

  await timelock.waitForDeployment();
  const timelockAddress = await timelock.getAddress();

  console.log("\n=== TimelockController Deployed ===");
  console.log("TimelockController Address:", timelockAddress);
  console.log("Min Delay:", minDelay, "seconds");
  console.log("Proposers:", proposers);
  console.log("Executors:", executors);
  console.log("Admin:", admin);

  console.log("\n=== Verification Command ===");
  console.log(
    `# Verify TimelockController:\nnpx hardhat verify --network ${hre.network.name} ${timelockAddress} ${minDelay} "[${proposers.map(a => `"${a}"`).join(",")}]" "[${executors.map(a => `"${a}"`).join(",")}]" "${admin}"`
  );

  console.log("\n=== Next Steps ===");
  console.log("1. Set TIMELOCK_ADDRESS environment variable:", timelockAddress);
  console.log("2. Run transfer-to-timelock.js to transfer ownership to the timelock");

  return {
    timelockAddress,
    minDelay,
    proposers,
    executors,
    admin,
    network: hre.network.name,
  };
}

main()
  .then((result) => {
    console.log("\n=== Deployment Summary ===");
    console.log(JSON.stringify(result, null, 2));
    process.exit(0);
  })
  .catch((error) => {
    console.error("Error:", error);
    process.exit(1);
  });

