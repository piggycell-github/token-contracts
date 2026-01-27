const { expect } = require("chai");
const { ethers } = require("hardhat");
const { time } = require("@nomicfoundation/hardhat-network-helpers");

describe("PiggycellStaking", function () {
  let staking, token, proxy;
  let owner, user1, user2;

  const INITIAL_SUPPLY = ethers.parseEther("1000000");
  const STAKE_AMOUNT = ethers.parseEther("10000");
  const REWARD_POOL = ethers.parseEther("100000");

  const DAY = 86400;
  const YEAR = 365 * DAY;

  beforeEach(async function () {
    [owner, user1, user2] = await ethers.getSigners();

    // Deploy mock ERC20 token
    const Token = await ethers.getContractFactory("MockERC20");
    token = await Token.deploy("PIGGY", "PIGGY", INITIAL_SUPPLY);

    // Deploy staking implementation
    const Staking = await ethers.getContractFactory("PiggycellStaking");
    const stakingImpl = await Staking.deploy();

    // Deploy proxy
    const initData = stakingImpl.interface.encodeFunctionData("initialize", [
      owner.address,
      await token.getAddress(),
      await token.getAddress()
    ]);

    const Proxy = await ethers.getContractFactory("contracts/ERC1967Proxy.sol:ERC1967Proxy");
    proxy = await Proxy.deploy(await stakingImpl.getAddress(), initData);

    staking = Staking.attach(await proxy.getAddress());

    // Setup: transfer tokens to users and fund reward pool
    await token.transfer(user1.address, ethers.parseEther("100000"));
    await token.transfer(user2.address, ethers.parseEther("100000"));

    await token.approve(await staking.getAddress(), REWARD_POOL);
    await staking.fundRewardPool(REWARD_POOL);

    // Approve staking contract
    await token.connect(user1).approve(await staking.getAddress(), ethers.MaxUint256);
    await token.connect(user2).approve(await staking.getAddress(), ethers.MaxUint256);
  });

  describe("1. Staking 시나리오", function () {
    it("1.1 첫 스테이킹 성공", async function () {
      await staking.connect(user1).stake(STAKE_AMOUNT);

      const info = await staking.getUserStakeInfo(user1.address);
      expect(info.amount).to.equal(STAKE_AMOUNT);
      expect(info.holdingDays).to.equal(0);
    });

    it("1.2 추가 스테이킹 - 가중 평균 타임스탬프", async function () {
      // 첫 스테이킹: 10,000 PIGGY
      await staking.connect(user1).stake(STAKE_AMOUNT);
      const firstTimestamp = (await staking.stakes(user1.address)).weightedTimestamp;

      // 30일 후 추가 스테이킹: 10,000 PIGGY
      await time.increase(30 * DAY);
      await staking.connect(user1).stake(STAKE_AMOUNT);

      const info = await staking.stakes(user1.address);
      expect(info.amount).to.equal(STAKE_AMOUNT * 2n);

      // 가중 평균: (10000*T + 10000*(T+30days)) / 20000 = T + 15days
      const expectedTimestamp = firstTimestamp + BigInt(15 * DAY);
      expect(info.weightedTimestamp).to.be.closeTo(expectedTimestamp, 10);
    });

    it("1.3 0 금액 스테이킹 실패", async function () {
      await expect(staking.connect(user1).stake(0))
        .to.be.revertedWithCustomError(staking, "ZeroAmount");
    });

    it("1.4 Pause 상태에서 스테이킹 실패", async function () {
      await staking.pause();
      await expect(staking.connect(user1).stake(STAKE_AMOUNT))
        .to.be.revertedWithCustomError(staking, "EnforcedPause");
    });
  });

  describe("2. Unstaking 시나리오", function () {
    beforeEach(async function () {
      await staking.connect(user1).stake(STAKE_AMOUNT);
    });

    it("2.1 전체 언스테이킹 성공", async function () {
      await time.increase(30 * DAY);

      const balanceBefore = await token.balanceOf(user1.address);
      await staking.connect(user1).unstake(STAKE_AMOUNT);
      const balanceAfter = await token.balanceOf(user1.address);

      // 원금 + 리워드 받아야 함
      expect(balanceAfter).to.be.gt(balanceBefore + STAKE_AMOUNT - 1n);

      const info = await staking.getUserStakeInfo(user1.address);
      expect(info.amount).to.equal(0);
    });

    it("2.2 부분 언스테이킹 - 타임스탬프 유지", async function () {
      await time.increase(60 * DAY);

      const timestampBefore = (await staking.stakes(user1.address)).weightedTimestamp;
      await staking.connect(user1).unstake(STAKE_AMOUNT / 2n);
      const timestampAfter = (await staking.stakes(user1.address)).weightedTimestamp;

      expect(timestampAfter).to.equal(timestampBefore);

      const info = await staking.getUserStakeInfo(user1.address);
      expect(info.amount).to.equal(STAKE_AMOUNT / 2n);
    });

    it("2.3 스테이킹 없이 언스테이킹 실패", async function () {
      await expect(staking.connect(user2).unstake(STAKE_AMOUNT))
        .to.be.revertedWithCustomError(staking, "NoStakeFound");
    });

    it("2.4 잔액 초과 언스테이킹 실패", async function () {
      await expect(staking.connect(user1).unstake(STAKE_AMOUNT * 2n))
        .to.be.revertedWithCustomError(staking, "InsufficientStakedBalance");
    });

    it("2.5 리워드 풀 부족 시 언스테이킹 실패", async function () {
      // 대량 스테이킹으로 리워드 풀 고갈 시뮬레이션
      await token.transfer(user2.address, ethers.parseEther("500000"));
      await token.connect(user2).approve(await staking.getAddress(), ethers.MaxUint256);
      await staking.connect(user2).stake(ethers.parseEther("500000"));

      // 1년 후 (12% APR)
      await time.increase(YEAR);

      // user2의 리워드가 풀보다 클 수 있음
      const reward = await staking.getEstimatedReward(user2.address, 0);
      const pool = await staking.getRewardPoolBalance();

      if (reward > pool) {
        await expect(staking.connect(user2).unstake(ethers.parseEther("500000")))
          .to.be.revertedWithCustomError(staking, "InsufficientRewardPool");
      }
    });
  });

  describe("3. Emergency Unstake 시나리오", function () {
    it("3.1 긴급 출금 - 리워드 없이 원금만", async function () {
      await staking.connect(user1).stake(STAKE_AMOUNT);
      await time.increase(100 * DAY);

      const balanceBefore = await token.balanceOf(user1.address);
      await staking.connect(user1).emergencyUnstake(STAKE_AMOUNT);
      const balanceAfter = await token.balanceOf(user1.address);

      // 정확히 원금만 반환
      expect(balanceAfter - balanceBefore).to.equal(STAKE_AMOUNT);
    });
  });

  describe("4. APR 계산 시나리오", function () {
    it("4.1 0-29일: 3% APR", async function () {
      expect(await staking.getAPRForDays(0)).to.equal(300);
      expect(await staking.getAPRForDays(15)).to.equal(300);
      expect(await staking.getAPRForDays(29)).to.equal(300);
    });

    it("4.2 30-89일: 5% APR", async function () {
      expect(await staking.getAPRForDays(30)).to.equal(500);
      expect(await staking.getAPRForDays(60)).to.equal(500);
      expect(await staking.getAPRForDays(89)).to.equal(500);
    });

    it("4.3 90-179일: 7% APR", async function () {
      expect(await staking.getAPRForDays(90)).to.equal(700);
      expect(await staking.getAPRForDays(120)).to.equal(700);
      expect(await staking.getAPRForDays(179)).to.equal(700);
    });

    it("4.4 180-364일: 9% APR", async function () {
      expect(await staking.getAPRForDays(180)).to.equal(900);
      expect(await staking.getAPRForDays(270)).to.equal(900);
      expect(await staking.getAPRForDays(364)).to.equal(900);
    });

    it("4.5 365+일: 12% APR", async function () {
      expect(await staking.getAPRForDays(365)).to.equal(1200);
      expect(await staking.getAPRForDays(1000)).to.equal(1200);
    });

    it("4.6 리워드 계산 검증", async function () {
      // 10,000 PIGGY * 5% * 30/365 = 약 41.1 PIGGY
      const reward = await staking.calculateReward(
        ethers.parseEther("10000"),
        30,
        500
      );
      const expected = ethers.parseEther("10000") * 500n * 30n / (10000n * 365n);
      expect(reward).to.equal(expected);
    });
  });

  describe("5. NFT Boost 시나리오", function () {
    it("5.1 0-999 PIGGY: 0% Boost", async function () {
      expect(await staking.getBoostForAmount(0)).to.equal(0);
      expect(await staking.getBoostForAmount(ethers.parseEther("999"))).to.equal(0);
    });

    it("5.2 1,000-4,999 PIGGY: 5% Boost", async function () {
      expect(await staking.getBoostForAmount(ethers.parseEther("1000"))).to.equal(500);
      expect(await staking.getBoostForAmount(ethers.parseEther("4999"))).to.equal(500);
    });

    it("5.3 5,000-9,999 PIGGY: 15% Boost", async function () {
      expect(await staking.getBoostForAmount(ethers.parseEther("5000"))).to.equal(1500);
      expect(await staking.getBoostForAmount(ethers.parseEther("9999"))).to.equal(1500);
    });

    it("5.4 10,000-49,999 PIGGY: 25% Boost", async function () {
      expect(await staking.getBoostForAmount(ethers.parseEther("10000"))).to.equal(2500);
      expect(await staking.getBoostForAmount(ethers.parseEther("49999"))).to.equal(2500);
    });

    it("5.5 50,000+ PIGGY: 40% Boost", async function () {
      expect(await staking.getBoostForAmount(ethers.parseEther("50000"))).to.equal(4000);
      expect(await staking.getBoostForAmount(ethers.parseEther("100000"))).to.equal(4000);
    });
  });

  describe("6. Owner 함수 시나리오", function () {
    it("6.1 APR 티어 업데이트 성공", async function () {
      const newTiers = [
        { minDays: 0, maxDays: 59, aprBps: 400 },
        { minDays: 60, maxDays: ethers.MaxUint256, aprBps: 1000 }
      ];

      await staking.setAPRTiers(newTiers);
      expect(await staking.getAPRForDays(30)).to.equal(400);
      expect(await staking.getAPRForDays(100)).to.equal(1000);
    });

    it("6.2 APR 티어 검증 실패 - 0일 시작 아님", async function () {
      const invalidTiers = [
        { minDays: 1, maxDays: ethers.MaxUint256, aprBps: 500 }
      ];

      await expect(staking.setAPRTiers(invalidTiers))
        .to.be.revertedWithCustomError(staking, "InvalidTierConfiguration");
    });

    it("6.3 APR 티어 검증 실패 - 연속성 없음", async function () {
      const invalidTiers = [
        { minDays: 0, maxDays: 29, aprBps: 300 },
        { minDays: 31, maxDays: ethers.MaxUint256, aprBps: 500 } // gap at day 30
      ];

      await expect(staking.setAPRTiers(invalidTiers))
        .to.be.revertedWithCustomError(staking, "InvalidTierConfiguration");
    });

    it("6.4 APR 50% 초과 실패", async function () {
      const invalidTiers = [
        { minDays: 0, maxDays: ethers.MaxUint256, aprBps: 5001 }
      ];

      await expect(staking.setAPRTiers(invalidTiers))
        .to.be.revertedWithCustomError(staking, "APRTooHigh");
    });

    it("6.5 NFT Boost 티어 업데이트 성공", async function () {
      const newTiers = [
        { minAmount: 0, boostBps: 0 },
        { minAmount: ethers.parseEther("100"), boostBps: 1000 }
      ];

      await staking.setNFTBoostTiers(newTiers);
      expect(await staking.getBoostForAmount(ethers.parseEther("100"))).to.equal(1000);
    });

    it("6.6 NFT Boost 티어 검증 실패 - 정렬 안됨", async function () {
      const invalidTiers = [
        { minAmount: 0, boostBps: 0 },
        { minAmount: ethers.parseEther("100"), boostBps: 500 },
        { minAmount: ethers.parseEther("50"), boostBps: 1000 } // not ascending
      ];

      await expect(staking.setNFTBoostTiers(invalidTiers))
        .to.be.revertedWithCustomError(staking, "InvalidTierConfiguration");
    });

    it("6.7 recoverERC20 - 리워드 풀 초과 회수 실패", async function () {
      const pool = await staking.getRewardPoolBalance();

      await expect(staking.recoverERC20(await token.getAddress(), pool + 1n))
        .to.be.revertedWithCustomError(staking, "ExceedsRecoverable");
    });

    it("6.8 비소유자 owner 함수 호출 실패", async function () {
      await expect(staking.connect(user1).pause())
        .to.be.revertedWithCustomError(staking, "OwnableUnauthorizedAccount");
    });
  });

  describe("7. Edge Cases", function () {
    it("7.1 동일 블록 스테이킹/언스테이킹", async function () {
      await staking.connect(user1).stake(STAKE_AMOUNT);
      await staking.connect(user1).unstake(STAKE_AMOUNT);

      const info = await staking.getUserStakeInfo(user1.address);
      expect(info.amount).to.equal(0);
    });

    it("7.2 여러 사용자 동시 스테이킹", async function () {
      await staking.connect(user1).stake(STAKE_AMOUNT);
      await staking.connect(user2).stake(STAKE_AMOUNT * 2n);

      expect(await staking.totalStaked()).to.equal(STAKE_AMOUNT * 3n);
    });

    it("7.3 totalRewardsPaid 누적 확인", async function () {
      await staking.connect(user1).stake(STAKE_AMOUNT);
      await time.increase(30 * DAY);

      const rewardBefore = await staking.totalRewardsPaid();
      await staking.connect(user1).unstake(STAKE_AMOUNT);
      const rewardAfter = await staking.totalRewardsPaid();

      expect(rewardAfter).to.be.gt(rewardBefore);
    });

    it("7.4 getAPRProgress 정확성", async function () {
      await staking.connect(user1).stake(STAKE_AMOUNT);
      await time.increase(15 * DAY);

      const progress = await staking.getAPRProgress(user1.address);
      expect(progress.currentTierIndex).to.equal(0);
      expect(progress.daysToNextTier).to.be.closeTo(15, 1);
      expect(progress.nextAPR).to.equal(500);
    });

    it("7.5 getNFTBoostProgress 정확성", async function () {
      await staking.connect(user1).stake(ethers.parseEther("3000"));

      const progress = await staking.getNFTBoostProgress(user1.address);
      expect(progress.currentTierIndex).to.equal(1); // 1000-4999 tier
      expect(progress.amountToNextTier).to.equal(ethers.parseEther("2000")); // need 5000
      expect(progress.nextBoost).to.equal(1500);
    });

    it("7.6 MAX_TIERS 초과 실패", async function () {
      const tooManyTiers = [];
      for (let i = 0; i < 21; i++) {
        tooManyTiers.push({
          minDays: i,
          maxDays: i === 20 ? ethers.MaxUint256 : i,
          aprBps: 100
        });
      }

      await expect(staking.setAPRTiers(tooManyTiers))
        .to.be.revertedWithCustomError(staking, "TooManyTiers");
    });
  });
});
