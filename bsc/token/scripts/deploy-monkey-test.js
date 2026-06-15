import hre from "hardhat";

async function main() {
  await hre.run("compile");

  const [deployer] = await hre.ethers.getSigners();
  console.log("============================================================");
  console.log("Deploying MonkeyTest Token");
  console.log("============================================================");
  console.log("\nDeployer:", deployer.address);

  const balance = await hre.ethers.provider.getBalance(deployer.address);
  console.log("Balance:", hre.ethers.formatEther(balance), "BNB");

  // Owner wallet - deployer가 owner가 됨
  const ownerWallet = deployer.address;

  console.log("\n=== Step 1: Deploying Implementation Contract ===");
  const MonkeyTestFactory = await hre.ethers.getContractFactory("MonkeyTest");

  const implementation = await MonkeyTestFactory.deploy();
  await implementation.waitForDeployment();
  const implementationAddress = await implementation.getAddress();
  console.log("Implementation deployed at:", implementationAddress);

  console.log("\n=== Step 2: Deploying Proxy Contract ===");
  const ERC1967ProxyFactory = await hre.ethers.getContractFactory(
    "contracts/ERC1967Proxy.sol:ERC1967Proxy"
  );

  const initializeData = MonkeyTestFactory.interface.encodeFunctionData(
    "initialize",
    [ownerWallet]
  );

  const proxy = await ERC1967ProxyFactory.deploy(
    implementationAddress,
    initializeData
  );
  await proxy.waitForDeployment();
  const proxyAddress = await proxy.getAddress();
  console.log("Proxy deployed at:", proxyAddress);

  console.log("\n=== Step 3: Verifying Deployment ===");
  const MonkeyTest = await hre.ethers.getContractAt("MonkeyTest", proxyAddress);

  console.log("Proxy Address:", proxyAddress);
  console.log("Implementation Address:", implementationAddress);
  console.log("Name:", await MonkeyTest.name());
  console.log("Symbol:", await MonkeyTest.symbol());
  console.log("Decimals:", await MonkeyTest.decimals());
  console.log("Owner:", await MonkeyTest.owner());
  console.log(
    "Max Supply:",
    hre.ethers.formatEther(await MonkeyTest.MAX_SUPPLY()),
    "MONKEY"
  );
  console.log(
    "Total Supply:",
    hre.ethers.formatEther(await MonkeyTest.totalSupply()),
    "MONKEY"
  );
  console.log(
    "Owner Balance:",
    hre.ethers.formatEther(await MonkeyTest.balanceOf(ownerWallet)),
    "MONKEY"
  );

  console.log("\n============================================================");
  console.log("Deployment Complete!");
  console.log("============================================================");

  console.log("\n=== Verification Commands ===");
  console.log(
    `npx hardhat verify --network ${hre.network.name} ${implementationAddress}`
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
