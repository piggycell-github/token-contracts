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

  const ownerWallet = process.env.OWNER_WALLET;
  
  if (!ownerWallet) {
    throw new Error("OWNER_WALLET environment variable is required");
  }

  console.log("\n=== Step 1: Deploying Implementation Contract ===");
  const PiggycellFactory = await hre.ethers.getContractFactory("Piggycell");
  
  const implementation = await PiggycellFactory.deploy();
  await implementation.waitForDeployment();
  const implementationAddress = await implementation.getAddress();
  console.log("Implementation deployed at:", implementationAddress);

  console.log("\n=== Step 2: Deploying Proxy Contract ===");
  const ERC1967ProxyFactory = await hre.ethers.getContractFactory("contracts/ERC1967Proxy.sol:ERC1967Proxy");
  
  const initializeData = PiggycellFactory.interface.encodeFunctionData(
    "initialize",
    [ownerWallet]
  );

  const proxy = await ERC1967ProxyFactory.deploy(implementationAddress, initializeData);
  await proxy.waitForDeployment();
  const proxyAddress = await proxy.getAddress();
  console.log("Proxy deployed at:", proxyAddress);

  console.log("\n=== Step 3: Verifying Contract ===");
  const Piggycell = await hre.ethers.getContractAt("Piggycell", proxyAddress);

  console.log("Proxy Address:", proxyAddress);
  console.log("Implementation Address:", implementationAddress);
  console.log("Name:", await Piggycell.name());
  console.log("Symbol:", await Piggycell.symbol());
  console.log("Decimals:", await Piggycell.decimals());
  console.log("Owner:", await Piggycell.owner());
  console.log("Max Supply:", hre.ethers.formatEther(await Piggycell.MAX_SUPPLY()), "PIGGY");
  console.log(
    "Total Supply:",
    hre.ethers.formatEther(await Piggycell.totalSupply()),
    "PIGGY"
  );
  console.log(
    "Owner Wallet Balance:",
    hre.ethers.formatEther(await Piggycell.balanceOf(ownerWallet)),
    "PIGGY"
  );

  console.log("\n=== Verification Commands ===");
  console.log(
    `# Verify Implementation:\nnpx hardhat verify --network ${hre.network.name} ${implementationAddress}`
  );
  console.log(
    `# Verify Proxy:\nnpx hardhat verify --network ${hre.network.name} ${proxyAddress} ${implementationAddress} "${initializeData}"`
  );

  return {
    proxyAddress,
    implementationAddress,
    deployer: deployer.address,
    ownerWallet,
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

