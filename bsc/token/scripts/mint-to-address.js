import { ethers } from "hardhat";

// Gas optimization utilities
class GasOptimizer {
  constructor(provider, network) {
    this.provider = provider;
    this.network = network;
  }

  async getOptimizedGasConfig() {
    try {
      // Check if network supports EIP-1559
      const feeData = await this.provider.getFeeData();

      if (feeData.maxFeePerGas && feeData.maxPriorityFeePerGas) {
        // Use Type 2 transaction (EIP-1559)
        const maxPriorityFeePerGas =
          (feeData.maxPriorityFeePerGas * 110n) / 100n; // 10% increase
        const maxFeePerGas = (feeData.maxFeePerGas * 120n) / 100n; // 20% increase

        return {
          type: 2,
          maxFeePerGas,
          maxPriorityFeePerGas,
        };
      } else {
        // Use Legacy transaction
        const gasPrice = (feeData.gasPrice * 110n) / 100n; // 10% increase
        return {
          type: 0,
          gasPrice,
        };
      }
    } catch (error) {
      console.log("⚠️  Gas price auto-setting failed, using default value");
      return {
        type: 0,
        gasPrice: ethers.parseUnits("5", "gwei"), // 5 gwei fallback for BSC
      };
    }
  }

  async estimateGasWithBuffer(contract, method, params, bufferPercent = 20) {
    try {
      const estimatedGas = await contract[method].estimateGas(...params);
      return (estimatedGas * BigInt(100 + bufferPercent)) / 100n;
    } catch (error) {
      console.log(`⚠️  Gas estimation failed: ${error.message}`);
      return 100000n; // Default value
    }
  }
}

async function main() {
  console.log("\n🚀 PiggycellToken Optimized Minting Script v2.0");
  console.log("=".repeat(60));

  // Environment variable validation
  if (!process.env.PRIVATE_KEY) {
    console.error("❌ Error: PRIVATE_KEY environment variable is not set.");
    console.error(
      "💡 Solution: Add PRIVATE_KEY=your_private_key to .env file."
    );
    process.exit(1);
  }

  // Configuration values (use environment variables or defaults)
  const CONTRACT_ADDRESS =
    process.env.CONTRACT_ADDRESS ||
    "0x4d9f91728A0EC27a000C9723d1aa9491d286b697";
  const TARGET_ADDRESS =
    process.env.TARGET_ADDRESS || "0x0D745Ff007d343D79164E30Ad00340d5770bFE27";
  const MINT_AMOUNT = parseInt(process.env.MINT_AMOUNT || "777");
  const MINT_COUNT = parseInt(process.env.MINT_COUNT || "1");
  const TOTAL_AMOUNT = MINT_AMOUNT * MINT_COUNT;

  // Validate configuration values
  if (!ethers.isAddress(CONTRACT_ADDRESS)) {
    throw new Error(`❌ Invalid contract address: ${CONTRACT_ADDRESS}`);
  }
  if (!ethers.isAddress(TARGET_ADDRESS)) {
    throw new Error(`❌ Invalid target address: ${TARGET_ADDRESS}`);
  }
  if (MINT_AMOUNT <= 0 || MINT_COUNT <= 0) {
    throw new Error(
      `❌ Minting amount and count must be positive numbers. Amount: ${MINT_AMOUNT}, Count: ${MINT_COUNT}`
    );
  }

  try {
    // Check network information
    const network = await ethers.provider.getNetwork();
    console.log(
      `📡 Connected network: ${network.name} (ChainID: ${network.chainId})`
    );

    // Initialize gas optimization utility
    const gasOptimizer = new GasOptimizer(ethers.provider, network);

    // Network-specific validation
    const validNetworks = [97n, 56n]; // BSC testnet, mainnet
    if (!validNetworks.includes(network.chainId)) {
      console.log(
        `⚠️  Warning: Unverified network. ChainID: ${network.chainId}`
      );
    }

    // Get signer
    const [signer] = await ethers.getSigners();
    console.log(`🔑 Signer address: ${signer.address}`);

    // Check signer balance
    const balance = await ethers.provider.getBalance(signer.address);
    console.log(`💰 Signer BNB balance: ${ethers.formatEther(balance)} BNB`);

    // Network-specific minimum balance requirements
    const minBalance =
      network.chainId === 97n
        ? ethers.parseEther("0.001") // testnet
        : ethers.parseEther("0.01"); // mainnet

    if (balance < minBalance) {
      console.log(
        `⚠️  Warning: BNB balance may be insufficient. At least ${ethers.formatEther(
          minBalance
        )} BNB is required.`
      );
    }

    // Connect to contract
    console.log(`🔗 Contract address: ${CONTRACT_ADDRESS}`);
    const PiggycellTokenFactory = await ethers.getContractFactory(
      "PiggycellToken"
    );
    const PiggycellToken = PiggycellTokenFactory.attach(CONTRACT_ADDRESS);

    // Check basic contract information
    const [name, symbol, decimals, owner] = await Promise.all([
      PiggycellToken.name(),
      PiggycellToken.symbol(),
      PiggycellToken.decimals(),
      PiggycellToken.owner(),
    ]);

    console.log(`\n📋 Contract Information:`);
    console.log(`   - Name: ${name}`);
    console.log(`   - Symbol: ${symbol}`);
    console.log(`   - Decimals: ${decimals}`);
    console.log(`   - Owner: ${owner}`);

    // Check permissions
    if (signer.address.toLowerCase() !== owner.toLowerCase()) {
      throw new Error(
        `❌ No permission! Only contract owner (${owner}) can mint.`
      );
    }

    console.log(`\n🎯 Minting Plan:`);
    console.log(`   - Contract: ${CONTRACT_ADDRESS}`);
    console.log(`   - Target Address: ${TARGET_ADDRESS}`);
    console.log(`   - Amount per Mint: ${MINT_AMOUNT} PIGGY`);
    console.log(`   - Mint Count: ${MINT_COUNT} times`);
    console.log(`   - Total Amount: ${TOTAL_AMOUNT} PIGGY`);

    // Check initial state
    const initialBalance = await PiggycellToken.balanceOf(TARGET_ADDRESS);
    const initialTotalSupply = await PiggycellToken.totalSupply();

    console.log(`\n📊 Pre-Minting State:`);
    console.log(`   - Target Address Balance: ${initialBalance} PIGGY`);
    console.log(`   - Total Supply: ${initialTotalSupply} PIGGY`);

    console.log(`\n🚀 Starting Minting...`);
    console.log("-".repeat(50));

    // Get optimized gas settings
    console.log(`\n⚡ Optimizing gas prices...`);
    const gasConfig = await gasOptimizer.getOptimizedGasConfig();
    console.log(
      `   📊 Gas Settings: ${
        gasConfig.type === 2 ? "EIP-1559 (Type 2)" : "Legacy (Type 0)"
      }`
    );

    if (gasConfig.type === 2) {
      console.log(
        `   🚀 Max Fee Per Gas: ${ethers.formatUnits(
          gasConfig.maxFeePerGas,
          "gwei"
        )} gwei`
      );
      console.log(
        `   ⚡ Max Priority Fee: ${ethers.formatUnits(
          gasConfig.maxPriorityFeePerGas,
          "gwei"
        )} gwei`
      );
    } else {
      console.log(
        `   ⛽ Gas Price: ${ethers.formatUnits(
          gasConfig.gasPrice,
          "gwei"
        )} gwei`
      );
    }

    // Execute continuous minting (with retry logic)
    for (let i = 1; i <= MINT_COUNT; i++) {
      console.log(
        `\n⏳ [${i}/${MINT_COUNT}] Minting ${MINT_AMOUNT} PIGGY points...`
      );

      let retryCount = 0;
      const maxRetries = 3;
      let success = false;

      while (!success && retryCount < maxRetries) {
        try {
          // Smart gas estimation (with buffer)
          const gasLimit = await gasOptimizer.estimateGasWithBuffer(
            PiggycellToken,
            "mint",
            [TARGET_ADDRESS, MINT_AMOUNT],
            20 // 20% buffer
          );
          console.log(`   💨 Estimated gas (with buffer): ${gasLimit}`);

          // Configure transaction options
          const txOptions = {
            gasLimit,
            ...gasConfig,
          };

          // Execute minting (using correct function name)
          const tx = await PiggycellToken.mint(
            TARGET_ADDRESS,
            MINT_AMOUNT,
            txOptions
          );
          console.log(`   📝 Transaction hash: ${tx.hash}`);

          // Wait for transaction (detailed feedback)
          console.log(`   ⏰ Waiting for block confirmation... (max 30s)`);
          const receipt = await tx.wait(1, 30000); // 1 confirmation, 30s timeout

          // Check results and analysis
          const currentBalance = await PiggycellToken.balanceOf(TARGET_ADDRESS);
          const gasUsed = receipt.gasUsed;
          const effectiveGasPrice =
            receipt.gasPrice || receipt.effectiveGasPrice || tx.gasPrice;
          const txCost = ethers.formatEther(gasUsed * effectiveGasPrice);

          // Gas efficiency analysis
          const gasEfficiency = Number((gasUsed * 100n) / gasLimit);

          console.log(`   ✅ Success! Block: ${receipt.blockNumber}`);
          console.log(`   📈 Current Balance: ${currentBalance} PIGGY`);
          console.log(
            `   ⛽ Gas Used: ${gasUsed} / ${gasLimit} (Efficiency: ${gasEfficiency.toFixed(
              1
            )}%)`
          );
          console.log(`   💰 Transaction Cost: ${txCost} BNB`);

          if (effectiveGasPrice) {
            console.log(
              `   📊 Actual Gas Price: ${ethers.formatUnits(
                effectiveGasPrice,
                "gwei"
              )} gwei`
            );
          }

          success = true;

          // Wait to prevent network load (except last minting)
          if (i < MINT_COUNT) {
            console.log(`   😴 Waiting 1 second until next minting...`);
            await new Promise((resolve) => setTimeout(resolve, 1000));
          }
        } catch (error) {
          retryCount++;
          console.error(
            `   ❌ Attempt ${retryCount}/${maxRetries} failed: ${error.message}`
          );

          if (retryCount < maxRetries) {
            const waitTime = retryCount * 2; // Exponential backoff
            console.log(`   🔄 Retrying after ${waitTime} seconds...`);
            await new Promise((resolve) =>
              setTimeout(resolve, waitTime * 1000)
            );
          } else {
            throw new Error(
              `${i}th minting failed after ${maxRetries} attempts: ${error.message}`
            );
          }
        }
      }
    }

    // Check final results
    console.log(`\n${"=".repeat(50)}`);
    console.log(`🎉 All minting completed!`);

    const finalBalance = await PiggycellToken.balanceOf(TARGET_ADDRESS);
    const finalTotalSupply = await PiggycellToken.totalSupply();
    const actualIncrease = finalBalance - initialBalance;

    console.log(`\n📊 Final Results:`);
    console.log(`   - Balance Before Minting: ${initialBalance} PIGGY`);
    console.log(`   - Balance After Minting: ${finalBalance} PIGGY`);
    console.log(`   - Actual Increase: ${actualIncrease} PIGGY`);
    console.log(`   - Expected Increase: ${TOTAL_AMOUNT} PIGGY`);
    console.log(`   - Total Supply: ${finalTotalSupply} PIGGY`);

    if (actualIncrease === BigInt(TOTAL_AMOUNT)) {
      console.log(
        `\n✅ Minting successful! Exactly ${TOTAL_AMOUNT} PIGGY points were issued.`
      );
    } else {
      console.log(
        `\n⚠️  Results differ from expected. Please check network or contract status.`
      );
    }

    // Network-specific explorer links
    const explorerUrl =
      network.chainId === 97n
        ? "https://testnet.bscscan.com"
        : "https://bscscan.com";

    console.log(`\n🔗 Check on Blockchain Explorer:`);
    console.log(
      `   💼 Wallet Address: ${explorerUrl}/address/${TARGET_ADDRESS}`
    );
    console.log(`   📄 Contract: ${explorerUrl}/address/${CONTRACT_ADDRESS}`);
    console.log(`${"=".repeat(50)}\n`);
  } catch (error) {
    console.error("\n❌ Fatal error occurred during minting process:");
    console.error(`   Error message: ${error.message}`);

    // Specific error type guides
    if (error.message.includes("insufficient funds")) {
      console.error("\n💰 Insufficient Balance Error:");
      console.error("   - BNB balance is insufficient for gas fees");
      console.error(
        "   - Testnet: Get BNB from https://testnet.bnbchain.org/faucet-smart"
      );
      console.error("   - Mainnet: Purchase BNB from exchange and transfer");
    } else if (error.message.includes("Ownable")) {
      console.error("\n🔐 Permission Error:");
      console.error("   - Current wallet is not the contract owner");
      console.error("   - Please retry with contract owner wallet");
    } else if (error.message.includes("nonce")) {
      console.error("\n🔄 Nonce Error:");
      console.error("   - There's an issue with wallet transaction ordering");
      console.error("   - Reset wallet or try again later");
    } else if (error.message.includes("gas")) {
      console.error("\n⛽ Gas Related Error:");
      console.error(
        "   - Gas price may be too low or network may be congested"
      );
      console.error("   - Increase gas price or try again later");
    }

    console.error("\n🔧 General Solutions:");
    console.error("1. Environment Setup:");
    console.error(
      "   - PRIVATE_KEY in .env file is correctly set without 0x prefix"
    );
    console.error(
      "   - Using correct network (--network bsc_testnet or bsc_mainnet)"
    );
    console.error("2. Permission Check:");
    console.error(
      "   - Check if current wallet is owner of PiggycellToken contract"
    );
    console.error("   - Owner address can be checked with owner() function");
    console.error("3. Balance Check:");
    console.error(
      "   - Sufficient BNB balance (Testnet: 0.001+ BNB, Mainnet: 0.01+ BNB)"
    );
    console.error("   - Ensure extra balance for gas fee calculations");
    console.error("4. Network Status:");
    console.error("   - Internet connection and RPC endpoint response status");
    console.error("   - Check BSC network block generation status");

    console.error(
      `\n📞 If you need support, please contact with the following information:`
    );
    try {
      const networkInfo = await ethers.provider.getNetwork();
      console.error(
        `   - Network: ${networkInfo.name} (ChainID: ${networkInfo.chainId})`
      );
    } catch {
      console.error(`   - Network: Connection failed`);
    }
    console.error(`   - Error Type: ${error.constructor.name}`);
    console.error(`   - Script Version: v2.0`);

    process.exit(1);
  }
}

// Execute script
main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
