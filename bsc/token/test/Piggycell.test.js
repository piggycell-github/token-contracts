import { expect } from "chai";
import hre from "hardhat";
const { ethers } = hre;

// Helper to convert BigInt to Number for chai comparisons
const toNumber = (value) => Number(value);

describe("PiggycellToken - Ultimate Optimization Version", function () {
  let PiggycellTokenFactory;
  let PiggycellToken;
  let owner;
  let addr1;
  let addr2;

  beforeEach(async function () {
    [owner, addr1, addr2] = await ethers.getSigners();

    PiggycellTokenFactory = await ethers.getContractFactory("PiggycellToken");
    // Deploy with addr1 as owner and 1,000,000 tokens as initial supply
    const initialSupply = ethers.parseEther("1000000");
    PiggycellToken = await PiggycellTokenFactory.deploy(
      addr1.address,
      initialSupply
    );
    await PiggycellToken.waitForDeployment();
  });

  describe("Basic Information", function () {
    it("Should have correct name, symbol, and decimals", async function () {
      expect(await PiggycellToken.name()).to.equal("Piggycell");
      expect(await PiggycellToken.symbol()).to.equal("PIGGY");
      expect(toNumber(await PiggycellToken.decimals())).to.equal(18);
    });

    it("Initial total supply should be 1,000,000", async function () {
      expect(await PiggycellToken.totalSupply()).to.equal(
        ethers.parseEther("1000000")
      );
    });

    it("Maximum supply should be 100 million", async function () {
      const maxSupply = await PiggycellToken.MAX_SUPPLY();
      expect(maxSupply).to.equal(ethers.parseEther("100000000"));
    });

    it("Owner wallet should have initial supply", async function () {
      expect(await PiggycellToken.balanceOf(addr1.address)).to.equal(
        ethers.parseEther("1000000")
      );
    });
  });

  describe("Minting & Burning Tests", function () {
    it("Mint function test", async function () {
      const amount = ethers.parseEther("100");
      const tx = await PiggycellToken.connect(addr1).mint(
        addr2.address,
        amount
      );
      const receipt = await tx.wait();

      console.log(`Mint gas cost: ${receipt.gasUsed.toString()}`);

      expect(await PiggycellToken.balanceOf(addr2.address)).to.equal(amount);
      expect(await PiggycellToken.totalSupply()).to.equal(
        ethers.parseEther("1000000") + amount
      );
    });

    it("Burn function test", async function () {
      const mintAmount = ethers.parseEther("100");
      const burnAmount = ethers.parseEther("50");

      // First mint
      await PiggycellToken.connect(addr1).mint(addr2.address, mintAmount);

      // Then burn
      const tx = await PiggycellToken.connect(addr1).burn(
        addr2.address,
        burnAmount
      );
      const receipt = await tx.wait();

      console.log(`Burn gas cost: ${receipt.gasUsed.toString()}`);

      expect(await PiggycellToken.balanceOf(addr2.address)).to.equal(
        burnAmount
      );
      expect(await PiggycellToken.totalSupply()).to.equal(
        ethers.parseEther("1000000") + burnAmount
      );
    });

    it("Should prevent minting beyond maximum supply", async function () {
      const maxSupply = await PiggycellToken.MAX_SUPPLY();
      const currentSupply = await PiggycellToken.totalSupply();
      const remaining = maxSupply - currentSupply;
      try {
        await PiggycellToken.connect(addr1).mint(addr2.address, remaining + 1n);
        expect.fail("Should have reverted");
      } catch (error) {
        expect(error.message).to.include("Exceeds maximum supply");
      }
    });

    it("Should prevent minting to zero address", async function () {
      try {
        await PiggycellToken.connect(addr1).mint(
          ethers.ZeroAddress,
          ethers.parseEther("100")
        );
        expect.fail("Should have reverted");
      } catch (error) {
        expect(error.message).to.include("Cannot mint to zero address");
      }
    });

    it("Should prevent burning from zero address", async function () {
      try {
        await PiggycellToken.connect(addr1).burn(
          ethers.ZeroAddress,
          ethers.parseEther("100")
        );
        expect.fail("Should have reverted");
      } catch (error) {
        expect(error.message).to.include("Cannot burn from zero address");
      }
    });

    it("Should prevent burning when insufficient balance", async function () {
      try {
        await PiggycellToken.connect(addr1).burn(
          addr2.address,
          ethers.parseEther("100")
        );
        expect.fail("Should have reverted");
      } catch (error) {
        expect(error.message).to.include("Insufficient balance");
      }
    });

    it("Should prevent minting/burning zero amount", async function () {
      try {
        await PiggycellToken.connect(addr1).mint(addr2.address, 0);
        expect.fail("Should have reverted");
      } catch (error) {
        expect(error.message).to.include("Amount must be greater than zero");
      }

      try {
        await PiggycellToken.connect(addr1).burn(addr2.address, 0);
        expect.fail("Should have reverted");
      } catch (error) {
        expect(error.message).to.include("Amount must be greater than zero");
      }
    });

    it("Gas cost performance test", async function () {
      const amount = ethers.parseEther("100");

      // Measure mint gas cost - owner (addr1) minting
      const mintTx = await PiggycellToken.connect(addr1).mint(
        addr2.address,
        amount
      );
      const mintReceipt = await mintTx.wait();
      const mintGas = mintReceipt.gasUsed;

      // Measure burn gas cost - owner (addr1) burning
      const burnTx = await PiggycellToken.connect(addr1).burn(
        addr2.address,
        ethers.parseEther("50")
      );
      const burnReceipt = await burnTx.wait();
      const burnGas = burnReceipt.gasUsed;

      console.log(`\n🚀 Final optimization results:`);
      console.log(`mint gas cost: ${mintGas.toString()}`);
      console.log(`burn gas cost: ${burnGas.toString()}`);

      // Check if gas costs are at reasonable levels
      expect(toNumber(mintGas)).to.be.lessThan(100000); // Less than 100k gas
      expect(toNumber(burnGas)).to.be.lessThan(100000); // Less than 100k gas
    });

    it("Non-authorized user should not have access", async function () {
      // addr2 is not authorized
      try {
        await PiggycellToken.connect(addr2).mint(
          addr2.address,
          ethers.parseEther("100")
        );
        expect.fail("Should have reverted");
      } catch (error) {
        expect(error.message).to.include("Not authorized");
      }

      try {
        await PiggycellToken.connect(addr2).burn(
          addr1.address,
          ethers.parseEther("50")
        );
        expect.fail("Should have reverted");
      } catch (error) {
        expect(error.message).to.include("Not authorized");
      }
    });
  });

  describe("Bulk Processing Performance", function () {
    it("Continuous minting performance test", async function () {
      const iterations = 10;
      const amount = ethers.parseEther("777");

      console.log(`\n⚡ ${iterations} consecutive mint performance test`);

      let totalGas = 0n;
      for (let i = 0; i < iterations; i++) {
        const tx = await PiggycellToken.connect(addr1).mint(
          addr2.address,
          amount
        );
        const receipt = await tx.wait();
        totalGas += receipt.gasUsed;
      }

      const avgGas = totalGas / BigInt(iterations);
      console.log(`Average mint gas cost: ${avgGas.toString()}`);
      console.log(`Total gas cost: ${totalGas.toString()}`);

      expect(await PiggycellToken.balanceOf(addr2.address)).to.equal(
        amount * BigInt(iterations)
      );
      expect(await PiggycellToken.totalSupply()).to.equal(
        ethers.parseEther("1000000") + amount * BigInt(iterations)
      );
    });

    it("Minting test near maximum supply", async function () {
      const maxSupply = await PiggycellToken.MAX_SUPPLY();
      const currentSupply = await PiggycellToken.totalSupply();
      const nearMaxAmount =
        maxSupply - currentSupply - ethers.parseEther("1000");

      // Mint up to near maximum supply
      await PiggycellToken.connect(addr1).mint(addr2.address, nearMaxAmount);

      // Check remaining supply
      const newCurrentSupply = await PiggycellToken.totalSupply();
      const remaining = maxSupply - newCurrentSupply;
      expect(remaining).to.equal(ethers.parseEther("1000"));

      // Can mint remaining amount
      await PiggycellToken.connect(addr1).mint(addr2.address, remaining);

      // No more minting possible
      try {
        await PiggycellToken.connect(addr1).mint(addr2.address, 1);
        expect.fail("Should have reverted");
      } catch (error) {
        expect(error.message).to.include("Exceeds maximum supply");
      }
    });
  });
});
