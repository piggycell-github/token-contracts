// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import "@openzeppelin/contracts-upgradeable/access/OwnableUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/utils/ReentrancyGuardUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/utils/PausableUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/proxy/utils/Initializable.sol";
import "@openzeppelin/contracts-upgradeable/proxy/utils/UUPSUpgradeable.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";

/**
 * @title PiggycellStaking
 * @author Piggycell Team
 * @notice PIGGY token staking contract with time-based APR and NFT Boost
 * @dev
 * Core Features:
 * 1. Time-based APR: APR automatically increases based on staking duration (3% -> 12%)
 * 2. Single Position: One staking position per user
 * 3. Weighted Average Duration: Additional stakes recalculate duration using weighted average
 * 4. Partial Unstaking: Partial withdrawals allowed, remaining stake keeps accruing time
 * 5. NFT Boost Query: Provides NFT reward boost % based on staked amount
 * 6. Policy Changes: APR/Boost tiers can be modified by owner
 *
 * Security: ReentrancyGuard, Pausable, UUPS Upgradeable, SafeERC20
 */
contract PiggycellStaking is
    Initializable,
    OwnableUpgradeable,
    ReentrancyGuardUpgradeable,
    PausableUpgradeable,
    UUPSUpgradeable
{
    using SafeERC20 for IERC20;

    // ============ Constants ============

    uint256 public constant DAYS_IN_YEAR = 365;
    uint256 public constant BASIS_POINTS = 10000; // 100% = 10000
    uint256 public constant SECONDS_PER_DAY = 86400;
    uint256 public constant MAX_APR = 5000; // Maximum APR 50%
    uint256 public constant MAX_BOOST = 10000; // Maximum Boost 100%
    uint256 public constant MAX_TIERS = 20; // Maximum tier count (DoS prevention)

    // ============ State Variables ============

    /// @notice Staking token (PIGGY)
    IERC20 public stakingToken;

    /// @notice Reward token (PIGGY)
    IERC20 public rewardToken;

    /// @notice Total amount staked
    uint256 public totalStaked;

    /// @notice Total rewards paid out
    uint256 public totalRewardsPaid;

    // ============ APR Tier Configuration ============

    /// @notice APR tier structure
    struct APRTier {
        uint256 minDays;    // Start day (inclusive)
        uint256 maxDays;    // End day (inclusive, last tier uses type(uint256).max)
        uint256 aprBps;     // APR in basis points
    }

    /// @notice APR tier array (sorted)
    APRTier[] public aprTiers;

    // ============ NFT Boost Tier Configuration ============

    /// @notice NFT Boost tier structure
    struct NFTBoostTier {
        uint256 minAmount;  // Minimum staked amount (inclusive)
        uint256 boostBps;   // Boost % in basis points
    }

    /// @notice NFT Boost tier array (sorted by amount ascending)
    NFTBoostTier[] public nftBoostTiers;

    // ============ User Data ============

    /// @notice User staking information
    struct StakeInfo {
        uint256 amount;              // Total staked amount
        uint256 weightedTimestamp;   // Weighted average start time
        uint256 totalRewardsClaimed; // Cumulative rewards claimed
    }

    /// @notice User staking info mapping
    mapping(address => StakeInfo) public stakes;

    // ============ Storage Gap (Upgrade Safety) ============

    /// @dev Storage gap for future upgrades
    uint256[50] private __gap;

    // ============ Events ============

    event Staked(
        address indexed user,
        uint256 amount,
        uint256 totalAmount,
        uint256 newWeightedTimestamp,
        bool isFirstStake
    );

    event Unstaked(
        address indexed user,
        uint256 amount,
        uint256 reward,
        uint256 holdingDays,
        uint256 aprApplied,
        uint256 remainingAmount
    );

    event EmergencyUnstaked(
        address indexed user,
        uint256 amount,
        uint256 remainingAmount
    );

    event RewardPoolFunded(address indexed funder, uint256 amount);
    event APRTiersUpdated(uint256 tierCount);
    event NFTBoostTiersUpdated(uint256 tierCount);

    // ============ Errors ============

    error ZeroAmount();
    error ZeroAddress();
    error InsufficientStakedBalance();
    error InsufficientRewardPool();
    error NoStakeFound();
    error InvalidTierConfiguration();
    error APRTooHigh();
    error BoostTooHigh();
    error TooManyTiers();
    error ExceedsRecoverable();
    error InvalidImplementation();

    // ============ Constructor ============

    /// @custom:oz-upgrades-unsafe-allow constructor
    constructor() {
        _disableInitializers();
    }

    // ============ Initializer ============

    /**
     * @notice Initialize the contract
     * @param _owner Owner address
     * @param _stakingToken Staking token address (PIGGY)
     * @param _rewardToken Reward token address (PIGGY)
     */
    function initialize(
        address _owner,
        address _stakingToken,
        address _rewardToken
    ) public initializer {
        if (_owner == address(0)) revert ZeroAddress();
        if (_stakingToken == address(0)) revert ZeroAddress();
        if (_rewardToken == address(0)) revert ZeroAddress();

        __Ownable_init(_owner);
        __ReentrancyGuard_init();
        __Pausable_init();
        __UUPSUpgradeable_init();

        stakingToken = IERC20(_stakingToken);
        rewardToken = IERC20(_rewardToken);

        // Initialize default tiers
        _initializeDefaultAPRTiers();
        _initializeDefaultNFTBoostTiers();
    }

    /**
     * @dev Initialize default APR tiers
     */
    function _initializeDefaultAPRTiers() internal {
        // 0-29 days: 3%
        aprTiers.push(APRTier({minDays: 0, maxDays: 29, aprBps: 300}));
        // 30-89 days: 5%
        aprTiers.push(APRTier({minDays: 30, maxDays: 89, aprBps: 500}));
        // 90-179 days: 7%
        aprTiers.push(APRTier({minDays: 90, maxDays: 179, aprBps: 700}));
        // 180-364 days: 9%
        aprTiers.push(APRTier({minDays: 180, maxDays: 364, aprBps: 900}));
        // 365+ days: 12%
        aprTiers.push(APRTier({minDays: 365, maxDays: type(uint256).max, aprBps: 1200}));
    }

    /**
     * @dev Initialize default NFT Boost tiers
     */
    function _initializeDefaultNFTBoostTiers() internal {
        // 0-999: 0%
        nftBoostTiers.push(NFTBoostTier({minAmount: 0, boostBps: 0}));
        // 1,000-4,999: 5%
        nftBoostTiers.push(NFTBoostTier({minAmount: 1000 * 1e18, boostBps: 500}));
        // 5,000-9,999: 15%
        nftBoostTiers.push(NFTBoostTier({minAmount: 5000 * 1e18, boostBps: 1500}));
        // 10,000-49,999: 25%
        nftBoostTiers.push(NFTBoostTier({minAmount: 10000 * 1e18, boostBps: 2500}));
        // 50,000+: 40%
        nftBoostTiers.push(NFTBoostTier({minAmount: 50000 * 1e18, boostBps: 4000}));
    }

    // ============ External Functions ============

    /**
     * @notice Stake tokens (new or additional)
     * @dev Additional stakes recalculate duration using weighted average. CEI pattern compliant.
     * @param amount Amount to stake
     */
    function stake(uint256 amount) external nonReentrant whenNotPaused {
        if (amount == 0) revert ZeroAmount();

        // CEI: Transfer tokens first (Interaction first for CEI with pull pattern)
        stakingToken.safeTransferFrom(msg.sender, address(this), amount);

        // Effects: Update state
        StakeInfo storage userStake = stakes[msg.sender];
        bool isFirstStake = (userStake.amount == 0);

        if (isFirstStake) {
            // New stake
            userStake.weightedTimestamp = block.timestamp;
            userStake.amount = amount;
        } else {
            // Additional stake: recalculate timestamp using weighted average
            // newTimestamp = (existingAmount * existingTimestamp + newAmount * currentTimestamp) / totalAmount
            uint256 existingAmount = userStake.amount;
            uint256 existingTimestamp = userStake.weightedTimestamp;
            uint256 newTotalAmount = existingAmount + amount;

            userStake.weightedTimestamp = (
                (existingAmount * existingTimestamp) + (amount * block.timestamp)
            ) / newTotalAmount;

            userStake.amount = newTotalAmount;
        }

        totalStaked += amount;

        emit Staked(
            msg.sender,
            amount,
            userStake.amount,
            userStake.weightedTimestamp,
            isFirstStake
        );
    }

    /**
     * @notice Unstake tokens (partial or full)
     * @dev Rewards calculated based on APR at unstaking time
     * @param amount Amount to unstake
     */
    function unstake(uint256 amount) external nonReentrant {
        if (amount == 0) revert ZeroAmount();

        StakeInfo storage userStake = stakes[msg.sender];
        if (userStake.amount == 0) revert NoStakeFound();
        if (userStake.amount < amount) revert InsufficientStakedBalance();

        // Calculate reward based on current holding time
        uint256 holdingDays = getHoldingDays(msg.sender);
        uint256 apr = getAPRForDays(holdingDays);
        uint256 reward = calculateReward(amount, holdingDays, apr);

        // Check reward pool balance
        uint256 rewardPoolBalance = getRewardPoolBalance();
        if (reward > rewardPoolBalance) revert InsufficientRewardPool();

        // Update state
        userStake.amount -= amount;
        totalStaked -= amount;
        userStake.totalRewardsClaimed += reward;
        totalRewardsPaid += reward;

        if (userStake.amount == 0) {
            // Full unstake: reset timestamp
            userStake.weightedTimestamp = 0;
        }
        // Partial unstake: keep weightedTimestamp (remaining amount keeps accruing time)

        // Transfer principal + reward
        uint256 totalPayout = amount + reward;
        stakingToken.safeTransfer(msg.sender, totalPayout);

        emit Unstaked(msg.sender, amount, reward, holdingDays, apr, userStake.amount);
    }

    /**
     * @notice Emergency unstake (principal only, no rewards)
     * @dev Use when reward pool is insufficient
     * @param amount Amount to unstake
     */
    function emergencyUnstake(uint256 amount) external nonReentrant {
        if (amount == 0) revert ZeroAmount();

        StakeInfo storage userStake = stakes[msg.sender];
        if (userStake.amount == 0) revert NoStakeFound();
        if (userStake.amount < amount) revert InsufficientStakedBalance();

        // Update state
        userStake.amount -= amount;
        totalStaked -= amount;

        if (userStake.amount == 0) {
            userStake.weightedTimestamp = 0;
        }

        // Transfer principal only (no rewards)
        stakingToken.safeTransfer(msg.sender, amount);

        emit EmergencyUnstaked(msg.sender, amount, userStake.amount);
    }

    // ============ View Functions ============

    /**
     * @notice Get user's current holding days
     * @param user User address
     * @return Staking duration in days
     */
    function getHoldingDays(address user) public view returns (uint256) {
        StakeInfo storage userStake = stakes[user];
        if (userStake.amount == 0) return 0;

        return (block.timestamp - userStake.weightedTimestamp) / SECONDS_PER_DAY;
    }

    /**
     * @notice Get APR for given days (basis points)
     * @param days_ Staking duration in days
     * @return APR in basis points (10000 = 100%)
     */
    function getAPRForDays(uint256 days_) public view returns (uint256) {
        uint256 len = aprTiers.length;
        for (uint256 i = 0; i < len; ) {
            if (days_ >= aprTiers[i].minDays && days_ <= aprTiers[i].maxDays) {
                return aprTiers[i].aprBps;
            }
            unchecked { ++i; }
        }
        return 0;
    }

    /**
     * @notice Get user's current APR
     * @param user User address
     * @return APR in basis points
     */
    function getCurrentAPR(address user) external view returns (uint256) {
        uint256 holdingDays = getHoldingDays(user);
        return getAPRForDays(holdingDays);
    }

    /**
     * @notice Calculate reward
     * @param amount Staked amount
     * @param holdingDays Duration in days
     * @param apr APR in basis points
     * @return Reward amount
     */
    function calculateReward(
        uint256 amount,
        uint256 holdingDays,
        uint256 apr
    ) public pure returns (uint256) {
        // reward = amount * (apr/10000) * (holdingDays/365)
        return (amount * apr * holdingDays) / (BASIS_POINTS * DAYS_IN_YEAR);
    }

    /**
     * @notice Get estimated reward for unstaking specific amount
     * @param user User address
     * @param amount Amount to unstake (0 for full amount)
     * @return Estimated reward amount
     */
    function getEstimatedReward(
        address user,
        uint256 amount
    ) external view returns (uint256) {
        StakeInfo storage userStake = stakes[user];
        if (userStake.amount == 0) return 0;

        uint256 unstakeAmount = amount == 0 ? userStake.amount : amount;
        if (unstakeAmount > userStake.amount) {
            unstakeAmount = userStake.amount;
        }

        uint256 holdingDays = getHoldingDays(user);
        uint256 apr = getAPRForDays(holdingDays);

        return calculateReward(unstakeAmount, holdingDays, apr);
    }

    /**
     * @notice Get user's estimated daily reward
     * @param user User address
     * @return Estimated daily reward amount
     */
    function getEstimatedDailyReward(address user) external view returns (uint256) {
        StakeInfo storage userStake = stakes[user];
        if (userStake.amount == 0) return 0;

        uint256 holdingDays = getHoldingDays(user);
        uint256 apr = getAPRForDays(holdingDays);

        return (userStake.amount * apr) / (BASIS_POINTS * DAYS_IN_YEAR);
    }

    /**
     * @notice Get NFT Boost for staked amount (basis points)
     * @param amount Staked amount
     * @return NFT Boost in basis points
     */
    function getBoostForAmount(uint256 amount) public view returns (uint256) {
        uint256 boost = 0;
        uint256 len = nftBoostTiers.length;
        for (uint256 i = 0; i < len; ) {
            if (amount >= nftBoostTiers[i].minAmount) {
                boost = nftBoostTiers[i].boostBps;
            }
            unchecked { ++i; }
        }
        return boost;
    }

    /**
     * @notice Get user's NFT Boost % (basis points)
     * @param user User address
     * @return NFT Boost % in basis points (10000 = 100%)
     */
    function getNFTBoostBasisPoints(address user) external view returns (uint256) {
        return getBoostForAmount(stakes[user].amount);
    }

    /**
     * @notice Get user's complete staking info
     * @param user User address
     * @return amount Total staked amount
     * @return holdingDays Duration in days
     * @return currentAPR Current APR in basis points
     * @return estimatedReward Estimated reward for full unstake
     * @return nftBoost NFT Boost % in basis points
     * @return weightedTimestamp Weighted average start time
     * @return totalRewardsClaimed Cumulative rewards claimed
     */
    function getUserStakeInfo(address user) external view returns (
        uint256 amount,
        uint256 holdingDays,
        uint256 currentAPR,
        uint256 estimatedReward,
        uint256 nftBoost,
        uint256 weightedTimestamp,
        uint256 totalRewardsClaimed
    ) {
        StakeInfo storage userStake = stakes[user];
        amount = userStake.amount;
        weightedTimestamp = userStake.weightedTimestamp;
        totalRewardsClaimed = userStake.totalRewardsClaimed;

        if (amount == 0) {
            return (0, 0, 0, 0, 0, 0, totalRewardsClaimed);
        }

        holdingDays = getHoldingDays(user);
        currentAPR = getAPRForDays(holdingDays);
        estimatedReward = calculateReward(amount, holdingDays, currentAPR);
        nftBoost = getBoostForAmount(amount);
    }

    /**
     * @notice Get reward pool balance
     * @return Available reward token balance
     */
    function getRewardPoolBalance() public view returns (uint256) {
        uint256 contractBalance = rewardToken.balanceOf(address(this));
        if (contractBalance <= totalStaked) return 0;
        return contractBalance - totalStaked;
    }

    /**
     * @notice Get APR progress info for next tier
     * @param user User address
     * @return currentTierIndex Current tier index
     * @return daysToNextTier Days remaining to next tier (0 if max tier)
     * @return nextAPR Next tier APR (current APR if max tier)
     * @return progressBps Progress within current tier (basis points, 10000 = 100%)
     */
    function getAPRProgress(address user) external view returns (
        uint256 currentTierIndex,
        uint256 daysToNextTier,
        uint256 nextAPR,
        uint256 progressBps
    ) {
        uint256 holdingDays = getHoldingDays(user);
        uint256 len = aprTiers.length;

        for (uint256 i = 0; i < len; ) {
            if (holdingDays >= aprTiers[i].minDays && holdingDays <= aprTiers[i].maxDays) {
                currentTierIndex = i;

                uint256 tierDuration = aprTiers[i].maxDays - aprTiers[i].minDays + 1;
                uint256 daysInCurrentTier = holdingDays - aprTiers[i].minDays;

                if (aprTiers[i].maxDays == type(uint256).max) {
                    progressBps = BASIS_POINTS;
                    daysToNextTier = 0;
                    nextAPR = aprTiers[i].aprBps;
                } else {
                    progressBps = (daysInCurrentTier * BASIS_POINTS) / tierDuration;
                    daysToNextTier = aprTiers[i].maxDays + 1 - holdingDays;
                    nextAPR = (i + 1 < len) ? aprTiers[i + 1].aprBps : aprTiers[i].aprBps;
                }
                return (currentTierIndex, daysToNextTier, nextAPR, progressBps);
            }
            unchecked { ++i; }
        }
    }

    /**
     * @notice Get NFT Boost progress info for next tier
     * @param user User address
     * @return currentTierIndex Current tier index
     * @return amountToNextTier Amount needed for next tier (0 if max tier)
     * @return nextBoost Next tier Boost % (current boost if max tier)
     */
    function getNFTBoostProgress(address user) external view returns (
        uint256 currentTierIndex,
        uint256 amountToNextTier,
        uint256 nextBoost
    ) {
        uint256 stakedAmount = stakes[user].amount;
        uint256 len = nftBoostTiers.length;

        for (uint256 i = len; i > 0; ) {
            if (stakedAmount >= nftBoostTiers[i - 1].minAmount) {
                currentTierIndex = i - 1;
                if (i < len) {
                    amountToNextTier = nftBoostTiers[i].minAmount - stakedAmount;
                    nextBoost = nftBoostTiers[i].boostBps;
                } else {
                    amountToNextTier = 0;
                    nextBoost = nftBoostTiers[i - 1].boostBps;
                }
                return (currentTierIndex, amountToNextTier, nextBoost);
            }
            unchecked { --i; }
        }
    }

    /**
     * @notice Get APR tier count
     * @return Number of APR tiers
     */
    function getAPRTierCount() external view returns (uint256) {
        return aprTiers.length;
    }

    /**
     * @notice Get NFT Boost tier count
     * @return Number of NFT Boost tiers
     */
    function getNFTBoostTierCount() external view returns (uint256) {
        return nftBoostTiers.length;
    }

    /**
     * @notice Get all APR tiers
     * @return Array of APR tiers
     */
    function getAllAPRTiers() external view returns (APRTier[] memory) {
        return aprTiers;
    }

    /**
     * @notice Get all NFT Boost tiers
     * @return Array of NFT Boost tiers
     */
    function getAllNFTBoostTiers() external view returns (NFTBoostTier[] memory) {
        return nftBoostTiers;
    }

    // ============ Owner Functions ============

    /**
     * @notice Update APR tiers
     * @dev Replaces all existing tiers.
     *      - First tier must start at minDays: 0
     *      - Last tier must have maxDays: type(uint256).max
     *      - Tiers must be contiguous (prev maxDays + 1 == next minDays)
     * @param newTiers New APR tier array (must be sorted)
     */
    function setAPRTiers(APRTier[] calldata newTiers) external onlyOwner {
        uint256 len = newTiers.length;

        // Validation: empty array or too many tiers
        if (len == 0) revert InvalidTierConfiguration();
        if (len > MAX_TIERS) revert TooManyTiers();

        // Validation: first tier must start at day 0
        if (newTiers[0].minDays != 0) revert InvalidTierConfiguration();

        // Validation: last tier must extend to infinity
        if (newTiers[len - 1].maxDays != type(uint256).max) revert InvalidTierConfiguration();

        // Delete existing tiers
        delete aprTiers;

        for (uint256 i = 0; i < len; ) {
            if (newTiers[i].aprBps > MAX_APR) revert APRTooHigh();
            if (i > 0 && newTiers[i].minDays != newTiers[i - 1].maxDays + 1) {
                revert InvalidTierConfiguration();
            }
            aprTiers.push(newTiers[i]);
            unchecked { ++i; }
        }

        emit APRTiersUpdated(len);
    }

    /**
     * @notice Update NFT Boost tiers
     * @dev Replaces all existing tiers.
     *      - First tier must have minAmount: 0
     *      - Must be sorted in ascending order by amount
     * @param newTiers New NFT Boost tier array (sorted by amount ascending)
     */
    function setNFTBoostTiers(NFTBoostTier[] calldata newTiers) external onlyOwner {
        uint256 len = newTiers.length;

        // Validation: empty array or too many tiers
        if (len == 0) revert InvalidTierConfiguration();
        if (len > MAX_TIERS) revert TooManyTiers();

        // Validation: first tier must start at amount 0
        if (newTiers[0].minAmount != 0) revert InvalidTierConfiguration();

        // Delete existing tiers
        delete nftBoostTiers;

        for (uint256 i = 0; i < len; ) {
            if (newTiers[i].boostBps > MAX_BOOST) revert BoostTooHigh();
            if (i > 0 && newTiers[i].minAmount <= newTiers[i - 1].minAmount) {
                revert InvalidTierConfiguration();
            }
            nftBoostTiers.push(newTiers[i]);
            unchecked { ++i; }
        }

        emit NFTBoostTiersUpdated(len);
    }

    /**
     * @notice Fund the reward pool
     * @param amount Amount to add to reward pool
     */
    function fundRewardPool(uint256 amount) external onlyOwner {
        if (amount == 0) revert ZeroAmount();

        rewardToken.safeTransferFrom(msg.sender, address(this), amount);

        emit RewardPoolFunded(msg.sender, amount);
    }

    /**
     * @notice Pause staking
     */
    function pause() external onlyOwner {
        _pause();
    }

    /**
     * @notice Unpause staking
     */
    function unpause() external onlyOwner {
        _unpause();
    }

    /**
     * @notice Recover accidentally sent tokens
     * @dev For stakingToken or rewardToken, only excess beyond staked amount can be recovered
     * @param token Token address to recover
     * @param amount Amount to recover
     */
    function recoverERC20(address token, uint256 amount) external onlyOwner {
        if (token == address(stakingToken) || token == address(rewardToken)) {
            if (amount > getRewardPoolBalance()) revert ExceedsRecoverable();
        }
        IERC20(token).safeTransfer(owner(), amount);
    }

    // ============ Internal Functions ============

    /**
     * @dev Authorize upgrade (owner only)
     * @param newImplementation New implementation contract address
     */
    function _authorizeUpgrade(address newImplementation) internal override onlyOwner {
        if (newImplementation == address(0) || newImplementation.code.length == 0) {
            revert InvalidImplementation();
        }
    }
}
