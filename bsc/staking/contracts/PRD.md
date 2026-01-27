# Piggycell PIGGY Staking Contract - PRD v1.0

## Overview

A PIGGY token staking contract that provides time-based APR and NFT boost functionality.

---

## Goals

1. Enable intuitive staking where users only input amounts without selecting lock periods
2. Incentivize long-term holding through automatic APR increases based on staking duration
3. Connect PIGGY holding incentives with NFT ownership value via staking amount-based NFT reward boost
4. Maximize participation through single pool / single position UX

---

## Core Features

### 1. Time-based APR

- APR is determined at unstaking based on holding duration
- No period selection UI; automatic accumulation
- APR is annualized; actual payout is calculated linearly based on holding period

| Holding Time | APR |
|--------------|-----|
| 0 - 29 days | 0% |
| 30 - 89 days | 5% |
| 90 - 179 days | 8% |
| 180 - 364 days | 12% |
| 365+ days | 18% |

### 2. NFT Reward Boost (Amount-based)

- Daily NFT rewards increase based on total staking amount
- Only active while staking is maintained
- Terminates immediately upon unstaking

| Staking Amount | NFT Boost |
|----------------|-----------|
| 0 - 999 PIGGY | 0% |
| ≥ 1,000 PIGGY | +10% |
| ≥ 5,000 PIGGY | +15% |
| ≥ 10,000 PIGGY | +20% |
| ≥ 50,000 PIGGY | +30% |
| ≥ 100,000 PIGGY | +40% |

### 3. Single Position

- One staking position per user
- Additional stakes are added to existing position
- Holding period is recalculated using weighted average

---

## User Flows

### Stake

1. User inputs amount only
2. Amount is added to single staking position (cumulative)
3. Holding time accumulation begins automatically
4. NFT Boost is automatically activated/adjusted

### Add More Stake

1. User inputs additional amount
2. Amount is merged with existing stake
3. Holding period is recalculated using weighted average:
   ```
   newTimestamp = (oldAmount × oldTimestamp + newAmount × currentTimestamp) / totalAmount
   ```
4. NFT Boost is automatically upgraded/adjusted

### Unstake

1. User inputs unstake amount
2. Rewards are calculated based on current holding time and applicable APR
3. Remaining amount continues staking with accumulated time preserved
4. NFT Boost is automatically downgraded/adjusted
5. NFT Boost terminates completely when total stake reaches 0

### Emergency Unstake

1. Used when reward pool is insufficient
2. Returns principal only, no rewards

---

## Reward Calculation

```
reward = amount × (apr / 10000) × (holdingDays / 365)
```

**Example:**
- Staking: 10,000 PIGGY
- Holding: 45 days (30-89 day tier = 5% APR)
- Reward = 10,000 × 0.05 × (45/365) = 61.64 PIGGY

---

## Weighted Average Timestamp

When additional stakes are made, the holding period is recalculated using weighted average:

```
D_new = (S_old × D_old + S_new × 0) / (S_old + S_new)
```

**Example:**
- Existing: 10,000 PIGGY, 60 days held
- Additional: 10,000 PIGGY (0 days)
- New average: (10,000 × 60 + 10,000 × 0) / 20,000 = 30 days

---

## Contract Interface

### User Functions

| Function | Description |
|----------|-------------|
| `stake(uint256 amount)` | Stake tokens (new or additional) |
| `unstake(uint256 amount)` | Unstake tokens (partial or full) |
| `emergencyUnstake(uint256 amount)` | Emergency unstake (principal only) |

### View Functions

| Function | Returns |
|----------|---------|
| `getUserStakeInfo(address)` | Complete user staking information |
| `getHoldingDays(address)` | Holding duration in days |
| `getCurrentAPR(address)` | Current applicable APR |
| `getEstimatedReward(address, uint256)` | Estimated reward for unstaking |
| `getEstimatedDailyReward(address)` | Estimated daily reward |
| `getNFTBoostBasisPoints(address)` | NFT Boost percentage |
| `getAPRProgress(address)` | APR tier progress info |
| `getNFTBoostProgress(address)` | Boost tier progress info |
| `getRewardPoolBalance()` | Available reward pool balance |

### Owner Functions

| Function | Description |
|----------|-------------|
| `setAPRTiers(APRTier[])` | Update APR tiers |
| `setNFTBoostTiers(NFTBoostTier[])` | Update Boost tiers |
| `fundRewardPool(uint256)` | Fund reward pool |
| `pause()` / `unpause()` | Pause/unpause staking |
| `recoverERC20(address, uint256)` | Recover tokens |

---

## Security Features

| Feature | Implementation |
|---------|----------------|
| Reentrancy Protection | `ReentrancyGuard` |
| Overflow Protection | Solidity 0.8.26 |
| Access Control | `Ownable` |
| Emergency Stop | `Pausable` |
| Safe Token Transfer | `SafeERC20` |
| Upgrade Safety | UUPS + Storage Gap |

---

## Policy Notes

1. APR and Boost percentages may change based on season/policy
2. Changes apply only to future rewards (not retroactive)
3. When paused, only staking is blocked; unstaking is always available (fund withdrawal guaranteed)

---

## Technical Specifications

| Item | Value |
|------|-------|
| Solidity Version | ^0.8.26 |
| Upgrade Pattern | UUPS |
| Token Standard | ERC20 |
| Network | BSC (BNB Smart Chain) |
| Basis Points | 10000 = 100% |

---

## Deployment

```bash
# Environment Variables
PRIVATE_KEY=<deployer_private_key>
OWNER_WALLET=<owner_address>
PIGGY_TOKEN_ADDRESS=<piggy_token_proxy_address>

# Deploy
npx hardhat run scripts/deploy.js --network bsc_mainnet
```

---

## Version History

| Version | Date | Changes |
|---------|------|---------|
| v1.0 | 2025-01 | Initial release |
