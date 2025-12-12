import hre from "hardhat";

async function main() {
  // Get addresses from command line arguments or environment variables
  const implementationAddress = process.argv[2] || process.env.IMPLEMENTATION_ADDRESS;
  const proxyAddress = process.argv[3] || process.env.PROXY_ADDRESS;
  const ownerWallet = process.env.OWNER_WALLET;

  if (!implementationAddress) {
    throw new Error(
      "Implementation address is required. Usage: npx hardhat run scripts/verify.js --network <network> <IMPLEMENTATION_ADDRESS> <PROXY_ADDRESS>"
    );
  }

  if (!proxyAddress) {
    throw new Error(
      "Proxy address is required. Usage: npx hardhat run scripts/verify.js --network <network> <IMPLEMENTATION_ADDRESS> <PROXY_ADDRESS>"
    );
  }

  if (!ownerWallet) {
    throw new Error("OWNER_WALLET environment variable is required");
  }

  console.log("Network:", hre.network.name);
  console.log("Implementation Address:", implementationAddress);
  console.log("Proxy Address:", proxyAddress);
  console.log("Owner Wallet:", ownerWallet);

  // Generate initializeData
  const PiggycellFactory = await hre.ethers.getContractFactory("Piggycell");
  const initializeData = PiggycellFactory.interface.encodeFunctionData(
    "initialize",
    [ownerWallet]
  );
  console.log("Initialize Data:", initializeData);

  try {
    console.log("\n=== Step 1: Verifying Implementation Contract ===");
    await hre.run("verify:verify", {
      address: implementationAddress,
      constructorArguments: [],
    });
    console.log("✓ Implementation verified successfully!");
  } catch (error) {
    if (error.message.includes("Already Verified")) {
      console.log("✓ Implementation already verified");
    } else {
      console.error("✗ Implementation verification failed:", error.message);
      throw error;
    }
  }

  try {
    console.log("\n=== Step 2: Verifying Proxy Contract ===");
    
    // Try with standard contract first
    try {
      await hre.run("verify:verify", {
        address: proxyAddress,
        constructorArguments: [implementationAddress, initializeData],
        contract: "contracts/ERC1967Proxy.sol:ERC1967Proxy",
      });
      console.log("✓ Proxy verified successfully!");
    } catch (proxyError) {
      if (proxyError.message.includes("Already Verified")) {
        console.log("✓ Proxy already verified");
      } else {
        console.log("Standard verification failed, trying with flattened contract...");
        // Try with flattened contract
        await hre.run("verify:verify", {
          address: proxyAddress,
          constructorArguments: [implementationAddress, initializeData],
          contract: "contracts/ERC1967Proxy_flattened.sol:ERC1967Proxy",
        });
        console.log("✓ Proxy verified successfully with flattened contract!");
      }
    }
  } catch (error) {
    if (error.message.includes("Already Verified")) {
      console.log("✓ Proxy already verified");
    } else {
      console.error("✗ Proxy verification failed:", error.message);
      console.log("\n=== Manual Verification Instructions ===");
      console.log("You can verify manually on BSCScan:");
      console.log(`1. Go to https://${hre.network.name === 'bsc_mainnet' ? 'bscscan.com' : 'testnet.bscscan.com'}/address/${proxyAddress}`);
      console.log("2. Click 'Contract' tab -> 'Verify and Publish'");
      console.log("3. Use flattened source code from: contracts/ERC1967Proxy_flattened.sol");
      console.log(`4. Constructor arguments: ${implementationAddress}, ${initializeData}`);
      throw error;
    }
  }

  console.log("\n=== Verification Complete ===");
  console.log(`Implementation: https://${hre.network.name === 'bsc_mainnet' ? 'bscscan.com' : 'testnet.bscscan.com'}/address/${implementationAddress}`);
  console.log(`Proxy: https://${hre.network.name === 'bsc_mainnet' ? 'bscscan.com' : 'testnet.bscscan.com'}/address/${proxyAddress}`);
}

main()
  .then(() => {
    process.exit(0);
  })
  .catch((error) => {
    console.error("Error:", error);
    process.exit(1);
  });