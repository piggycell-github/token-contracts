import { expect } from "chai";
import hre from "hardhat";
const { ethers } = hre;

describe("PIGGY Continuous Minting Script", function () {
  let PiggycellTokenFactory;
  let PiggycellToken;
  let owner;

  // Target address for testing
  const TARGET_ADDRESS = "0x0D745Ff007d343D79164E30Ad00340d5770bFE27";
  const MINT_AMOUNT = 777;
  const MINT_COUNT = 10;

  before(async function () {
    console.log("\n🚀 PIGGY Minting Script Test Started");
    console.log("=" * 50);

    const [deployer, ownerWallet] = await ethers.getSigners();
    owner = ownerWallet; // Set owner to the second signer
    console.log(`Deployer address: ${deployer.address}`);
    console.log(`Owner wallet address: ${owner.address}`);

    // Deploy contract with different owner wallet and initial supply
    PiggycellTokenFactory = await ethers.getContractFactory("PiggycellToken");
    const initialSupply = ethers.parseEther("1000000"); // 1M tokens
    PiggycellToken = await PiggycellTokenFactory.deploy(
      owner.address,
      initialSupply
    );
    await PiggycellToken.waitForDeployment();

    const contractAddress = await PiggycellToken.getAddress();
    console.log(`PiggycellToken contract address: ${contractAddress}`);
    console.log(`Target minting address: ${TARGET_ADDRESS}`);
    console.log(
      `Minting amount: ${MINT_AMOUNT} × ${MINT_COUNT} times = ${
        MINT_AMOUNT * MINT_COUNT
      } total`
    );
    console.log("=" * 50);
  });

  describe("🎯 Main Minting Test", function () {
    it("should mint 777 PIGGY tokens 10 times to target address", async function () {
      console.log("\n📍 Starting continuous minting 777 tokens 10 times...\n");

      // Check initial state
      const initialBalance = await PiggycellToken.balanceOf(TARGET_ADDRESS);
      const initialTotalSupply = await PiggycellToken.totalSupply();

      console.log(`📊 Initial state:`);
      console.log(`   - Target address balance: ${initialBalance} PIGGY`);
      console.log(`   - Total supply: ${initialTotalSupply} PIGGY\n`);

      // Repeat 10 times to mint 777 tokens each
      for (let i = 1; i <= MINT_COUNT; i++) {
        console.log(`⏳ [${i}/${MINT_COUNT}] Minting in progress...`);

        // Balance before minting
        const beforeBalance = await PiggycellToken.balanceOf(TARGET_ADDRESS);

        // Execute minting and verify events (using owner account)
        const tx = await PiggycellToken.connect(owner).mint(
          TARGET_ADDRESS,
          ethers.parseEther(MINT_AMOUNT.toString())
        );
        const receipt = await tx.wait();

        // Balance after minting
        const afterBalance = await PiggycellToken.balanceOf(TARGET_ADDRESS);
        const increase = afterBalance - beforeBalance;

        console.log(
          `   ✅ Success! Balance: ${beforeBalance} → ${afterBalance} (+${increase} PIGGY)`
        );

        // Verification
        const expectedAmount = ethers.parseEther(MINT_AMOUNT.toString());
        expect(increase).to.equal(expectedAmount);
        expect(afterBalance).to.equal(
          initialBalance + ethers.parseEther((MINT_AMOUNT * i).toString())
        );
      }

      // Check final results
      const finalBalance = await PiggycellToken.balanceOf(TARGET_ADDRESS);
      const finalTotalSupply = await PiggycellToken.totalSupply();
      const totalMinted = MINT_AMOUNT * MINT_COUNT;
      const totalMintedWei = ethers.parseEther(totalMinted.toString());

      console.log(`\n🎉 Minting completed!`);
      console.log(`📊 Final results:`);
      console.log(
        `   - Target address final balance: ${ethers.formatEther(
          finalBalance
        )} PIGGY`
      );
      console.log(
        `   - Total supply: ${ethers.formatEther(finalTotalSupply)} PIGGY`
      );
      console.log(`   - Total minted: ${totalMinted} PIGGY`);
      console.log(
        `   - Increase: ${ethers.formatEther(
          finalBalance - initialBalance
        )} PIGGY\n`
      );

      // Final verification
      expect(finalBalance).to.equal(initialBalance + totalMintedWei);
      expect(finalTotalSupply).to.be.at.least(totalMintedWei);
    });
  });

  describe("🔍 Additional Verification Tests", function () {
    it("should verify target address has correct balance", async function () {
      const balance = await PiggycellToken.balanceOf(TARGET_ADDRESS);
      const expectedMinimum = ethers.parseEther(
        (MINT_AMOUNT * MINT_COUNT).toString()
      );

      console.log(`\n✨ Balance verification:`);
      console.log(`   - Current balance: ${ethers.formatEther(balance)} PIGGY`);
      console.log(
        `   - Minimum expected: ${ethers.formatEther(expectedMinimum)} PIGGY`
      );

      expect(balance).to.be.at.least(expectedMinimum);
      console.log(`   ✅ Verification passed!\n`);
    });

    it("should display final summary", async function () {
      const finalBalance = await PiggycellToken.balanceOf(TARGET_ADDRESS);
      const totalSupply = await PiggycellToken.totalSupply();
      const expectedMinimum = ethers.parseEther(
        (MINT_AMOUNT * MINT_COUNT).toString()
      );

      console.log(`\n📋 Final Summary Report`);
      console.log(`${"=".repeat(40)}`);
      console.log(`🎯 Target address: ${TARGET_ADDRESS}`);
      console.log(
        `💰 Final balance: ${ethers.formatEther(finalBalance)} PIGGY`
      );
      console.log(`📈 Total supply: ${ethers.formatEther(totalSupply)} PIGGY`);
      console.log(`✅ Test completed: Successfully minted 777 tokens 10 times`);
      console.log(`${"=".repeat(40)}\n`);

      expect(finalBalance).to.be.at.least(expectedMinimum);
    });
  });
});
