import hre from "hardhat";

async function main() {
  await hre.run("compile");

  const [deployer] = await hre.ethers.getSigners();
  console.log("Deployer:", deployer.address);

  const balance = await hre.ethers.provider.getBalance(deployer.address);
  console.log("Balance:", hre.ethers.formatEther(balance), "BNB");

  // Owner wallet address - can be multisig or regular wallet
  const ownerWallet = process.env.OWNER_WALLET;

  if (!ownerWallet) {
    throw new Error("OWNER_WALLET environment variable is required");
  }

  if (!hre.ethers.isAddress(ownerWallet)) {
    throw new Error("OWNER_WALLET is not a valid Ethereum address");
  }

  // Initial supply - default to MAX_SUPPLY (100,000,000 tokens)
  const initialSupplyInput = process.env.INITIAL_SUPPLY || "80000000";
  const initialSupply = hre.ethers.parseEther(initialSupplyInput);

  console.log("Owner Wallet:", ownerWallet);
  console.log("Initial Supply:", initialSupplyInput, "PIGGY");

  const PiggycellTokenFactory = await hre.ethers.getContractFactory(
    "PiggycellToken"
  );

  console.log("Deploying PiggycellToken...");
  console.log("- Owner wallet:", ownerWallet);
  console.log("- Initial supply:", initialSupplyInput, "PIGGY");
  const PiggycellToken = await PiggycellTokenFactory.deploy(
    ownerWallet,
    initialSupply
  );
  await PiggycellToken.waitForDeployment();

  const contractAddress = await PiggycellToken.getAddress();

  console.log("Contract:", contractAddress);
  console.log("Name:", await PiggycellToken.name());
  console.log("Symbol:", await PiggycellToken.symbol());
  console.log("Decimals:", await PiggycellToken.decimals());
  console.log("Owner:", await PiggycellToken.owner());
  console.log(
    "Total Supply:",
    hre.ethers.formatEther(await PiggycellToken.totalSupply()),
    "PIGGY"
  );
  console.log(
    "Owner Wallet Balance:",
    hre.ethers.formatEther(await PiggycellToken.balanceOf(ownerWallet)),
    "PIGGY"
  );
  console.log(
    "Deployer Balance:",
    hre.ethers.formatEther(await PiggycellToken.balanceOf(deployer.address)),
    "PIGGY"
  );

  console.log(
    `npx hardhat verify --network ${
      hre.network.name
    } ${contractAddress} ${ownerWallet} ${initialSupply.toString()}`
  );

  return {
    contractAddress,
    deployer: deployer.address,
    ownerWallet,
    network: hre.network.name,
  };
}

main()
  .then((result) => {
    console.log("Success:", result);
    process.exit(0);
  })
  .catch((error) => {
    console.error("Error:", error);
    process.exit(1);
  });
