import hre from "hardhat";

async function main() {
  await hre.run("compile");

  const [deployer] = await hre.ethers.getSigners();
  console.log("Deployer:", deployer.address);

  const balance = await hre.ethers.provider.getBalance(deployer.address);
  console.log("Balance:", hre.ethers.formatEther(balance), "BNB");

  const multisigWallet = process.env.MULTISIG_WALLET || process.env.OWNER_WALLET;

  if (!multisigWallet) {
    throw new Error("MULTISIG_WALLET or OWNER_WALLET environment variable is required");
  }

  if (!hre.ethers.isAddress(multisigWallet)) {
    throw new Error("Multisig wallet address is not a valid Ethereum address");
  }

  const code = await hre.ethers.provider.getCode(multisigWallet);
  if (code === "0x") {
    throw new Error("Multisig wallet must be a contract address (EOA not allowed)");
  }

  console.log("Multisig Wallet (token recipient & contract owner):", multisigWallet);
  console.log("Max Supply: 100,000,000 PIGGY (will be minted to multisig wallet)");

  console.log("\n=== Step 1: Deploying Implementation Contract ===");
  const PiggycellFactory = await hre.ethers.getContractFactory("Piggycell");
  
  const implementation = await PiggycellFactory.deploy();
  await implementation.waitForDeployment();
  const implementationAddress = await implementation.getAddress();
  console.log("Implementation deployed at:", implementationAddress);

  console.log("\n=== Step 2: Deploying Proxy Contract ===");
  const ERC1967Proxy = await hre.ethers.getContractFactory("ERC1967Proxy");
  
  const initializeData = PiggycellFactory.interface.encodeFunctionData(
    "initialize",
    [multisigWallet]
  );

  const proxy = await ERC1967Proxy.deploy(implementationAddress, initializeData);
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
    "Multisig Wallet Balance:",
    hre.ethers.formatEther(await Piggycell.balanceOf(multisigWallet)),
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
    multisigWallet,
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

