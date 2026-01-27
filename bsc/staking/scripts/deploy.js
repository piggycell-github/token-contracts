import hre from "hardhat";

async function main() {
  await hre.run("compile");

  // Check required environment variables
  if (!process.env.PRIVATE_KEY) {
    throw new Error("PRIVATE_KEY environment variable is required for deployment");
  }

  const piggyTokenAddress = process.env.PIGGY_TOKEN_ADDRESS;
  if (!piggyTokenAddress) {
    throw new Error("PIGGY_TOKEN_ADDRESS environment variable is required");
  }

  const ownerWallet = process.env.OWNER_WALLET;
  if (!ownerWallet) {
    throw new Error("OWNER_WALLET environment variable is required");
  }

  const [deployer] = await hre.ethers.getSigners();
  console.log("Deployer:", deployer.address);

  const balance = await hre.ethers.provider.getBalance(deployer.address);
  console.log("Balance:", hre.ethers.formatEther(balance), "BNB");

  if (balance === 0n) {
    throw new Error("Deployer wallet has no BNB. Please fund the wallet before deployment.");
  }

  console.log("\n=== Configuration ===");
  console.log("PIGGY Token Address:", piggyTokenAddress);
  console.log("Owner Wallet:", ownerWallet);

  console.log("\n=== Step 1: Deploying Implementation Contract ===");
  const StakingFactory = await hre.ethers.getContractFactory("PiggycellStaking");

  const implementation = await StakingFactory.deploy();
  await implementation.waitForDeployment();
  const implementationAddress = await implementation.getAddress();
  console.log("Implementation deployed at:", implementationAddress);

  console.log("\n=== Step 2: Deploying Proxy Contract ===");
  const ERC1967ProxyFactory = await hre.ethers.getContractFactory("contracts/ERC1967Proxy.sol:ERC1967Proxy");

  // Initialize with owner, staking token (PIGGY), and reward token (PIGGY)
  const initializeData = StakingFactory.interface.encodeFunctionData(
    "initialize",
    [ownerWallet, piggyTokenAddress, piggyTokenAddress]
  );

  const proxy = await ERC1967ProxyFactory.deploy(implementationAddress, initializeData);
  await proxy.waitForDeployment();
  const proxyAddress = await proxy.getAddress();
  console.log("Proxy deployed at:", proxyAddress);

  console.log("\n=== Step 3: Verifying Deployment ===");
  const Staking = await hre.ethers.getContractAt("PiggycellStaking", proxyAddress);

  console.log("Proxy Address:", proxyAddress);
  console.log("Implementation Address:", implementationAddress);
  console.log("Owner:", await Staking.owner());
  console.log("Staking Token:", await Staking.stakingToken());
  console.log("Reward Token:", await Staking.rewardToken());
  console.log("Total Staked:", hre.ethers.formatEther(await Staking.totalStaked()), "PIGGY");
  console.log("Reward Pool Balance:", hre.ethers.formatEther(await Staking.getRewardPoolBalance()), "PIGGY");

  console.log("\n=== APR Tiers ===");
  console.log("0~29 days:", Number(await Staking.APR_TIER_1()) / 100, "%");
  console.log("30~89 days:", Number(await Staking.APR_TIER_2()) / 100, "%");
  console.log("90~179 days:", Number(await Staking.APR_TIER_3()) / 100, "%");
  console.log("180~364 days:", Number(await Staking.APR_TIER_4()) / 100, "%");
  console.log("365+ days:", Number(await Staking.APR_TIER_5()) / 100, "%");

  console.log("\n=== NFT Boost Tiers ===");
  console.log("0~999 PIGGY:", Number(await Staking.NFT_BOOST_TIER_1()) / 100, "%");
  console.log("1,000~4,999 PIGGY:", Number(await Staking.NFT_BOOST_TIER_2()) / 100, "%");
  console.log("5,000~9,999 PIGGY:", Number(await Staking.NFT_BOOST_TIER_3()) / 100, "%");
  console.log("10,000~49,999 PIGGY:", Number(await Staking.NFT_BOOST_TIER_4()) / 100, "%");
  console.log("50,000+ PIGGY:", Number(await Staking.NFT_BOOST_TIER_5()) / 100, "%");

  console.log("\n=== Verification Commands ===");
  console.log(
    `# Verify Implementation:\nnpx hardhat verify --network ${hre.network.name} ${implementationAddress}`
  );
  console.log(
    `# Verify Proxy:\nnpx hardhat verify --network ${hre.network.name} ${proxyAddress} ${implementationAddress} "${initializeData}"`
  );

  console.log("\n=== Next Steps ===");
  console.log("1. Transfer PIGGY tokens to the staking contract for reward pool");
  console.log("   Example: Transfer 1,000,000 PIGGY to", proxyAddress);
  console.log("2. Or call fundRewardPool(amount) as owner after approving tokens");

  return {
    proxyAddress,
    implementationAddress,
    deployer: deployer.address,
    ownerWallet,
    piggyTokenAddress,
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
