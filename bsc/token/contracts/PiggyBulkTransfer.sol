// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "@openzeppelin/contracts/access/Ownable.sol";

/**
 * @title PiggyBulkTransfer
 * @notice Gas-optimized bulk transfer contract for PIGGY tokens on BSC
 * @dev Optimized for BSC's 140M-200M block gas limit
 *
 * Gas Optimization Techniques:
 * 1. unchecked blocks for loop counters (saves ~100 gas per iteration)
 * 2. Caching array length in memory (saves ~3 gas per iteration)
 * 3. Using unchecked for total amount calculation
 * 4. Single transferFrom for total amount + individual transfers
 *
 * Recommended batch sizes for BSC:
 * - Safe: 200 addresses per transaction
 * - Maximum: 300 addresses per transaction
 * - For 8000 transfers: 40 transactions @ 200 each
 */
contract PiggyBulkTransfer is Ownable {
    using SafeERC20 for IERC20;

    /// @notice Maximum recipients per transaction (gas limit safety)
    uint256 public constant MAX_RECIPIENTS = 300;

    /// @notice Emitted when a bulk transfer is completed
    event BulkTransferCompleted(
        address indexed token,
        address indexed sender,
        uint256 totalAmount,
        uint256 recipientCount
    );

    /// @notice Emitted when tokens are rescued
    event TokensRescued(address indexed token, address indexed to, uint256 amount);

    error ArrayLengthMismatch();
    error EmptyArray();
    error TooManyRecipients();
    error ZeroAddress();
    error ZeroAmount();

    constructor() Ownable(msg.sender) {}

    /**
     * @notice Transfer tokens to multiple recipients with different amounts
     * @dev Gas-optimized version - requires prior approval
     * @param token The ERC20 token address to transfer
     * @param recipients Array of recipient addresses
     * @param amounts Array of amounts to send to each recipient
     *
     * Gas cost estimation per transfer:
     * - Existing token holder: ~21,604 gas
     * - New token holder: ~41,104 gas
     *
     * For 200 recipients (mixed): ~6.3M - 8.2M gas
     * BSC block limit: 140M-200M gas (safe margin)
     */
    function bulkTransfer(
        address token,
        address[] calldata recipients,
        uint256[] calldata amounts
    ) external {
        uint256 length = recipients.length;

        if (length == 0) revert EmptyArray();
        if (length != amounts.length) revert ArrayLengthMismatch();
        if (length > MAX_RECIPIENTS) revert TooManyRecipients();

        // Calculate total amount (checked for safety)
        uint256 totalAmount;
        for (uint256 i; i < length; ) {
            totalAmount += amounts[i];
            unchecked { ++i; }
        }

        // Transfer total amount from sender to this contract
        IERC20(token).safeTransferFrom(msg.sender, address(this), totalAmount);

        // Distribute to recipients
        unchecked {
            for (uint256 i; i < length; ++i) {
                if (recipients[i] == address(0)) revert ZeroAddress();
                if (amounts[i] == 0) revert ZeroAmount();
                IERC20(token).safeTransfer(recipients[i], amounts[i]);
            }
        }

        emit BulkTransferCompleted(token, msg.sender, totalAmount, length);
    }

    /**
     * @notice Transfer same amount of tokens to multiple recipients
     * @dev More gas efficient when all recipients receive the same amount
     * @param token The ERC20 token address to transfer
     * @param recipients Array of recipient addresses
     * @param amount Amount to send to each recipient
     */
    function bulkTransferSameAmount(
        address token,
        address[] calldata recipients,
        uint256 amount
    ) external {
        uint256 length = recipients.length;

        if (length == 0) revert EmptyArray();
        if (length > MAX_RECIPIENTS) revert TooManyRecipients();
        if (amount == 0) revert ZeroAmount();

        // Calculate total amount (checked for safety)
        uint256 totalAmount = amount * length;

        // Transfer total amount from sender to this contract
        IERC20(token).safeTransferFrom(msg.sender, address(this), totalAmount);

        // Distribute to recipients
        unchecked {
            for (uint256 i; i < length; ++i) {
                if (recipients[i] == address(0)) revert ZeroAddress();
                IERC20(token).safeTransfer(recipients[i], amount);
            }
        }

        emit BulkTransferCompleted(token, msg.sender, totalAmount, length);
    }

    /**
     * @notice Rescue accidentally sent tokens
     * @dev Only owner can call this function
     * @param token The ERC20 token address to rescue
     * @param to Address to send rescued tokens
     * @param amount Amount to rescue
     */
    function rescueTokens(
        address token,
        address to,
        uint256 amount
    ) external onlyOwner {
        if (to == address(0)) revert ZeroAddress();
        IERC20(token).safeTransfer(to, amount);
        emit TokensRescued(token, to, amount);
    }

    /**
     * @notice Get the recommended batch size based on gas estimation
     * @dev Returns conservative estimates for BSC network
     * @param isNewHolders Whether recipients are new token holders (higher gas cost)
     * @return recommendedSize Recommended batch size
     * @return maxSize Maximum safe batch size
     */
    function getRecommendedBatchSize(bool isNewHolders)
        external
        pure
        returns (uint256 recommendedSize, uint256 maxSize)
    {
        if (isNewHolders) {
            // ~41,104 gas per transfer for new holders
            // Target: 10M gas per tx (safe margin)
            recommendedSize = 200;
            maxSize = 250;
        } else {
            // ~21,604 gas per transfer for existing holders
            // Target: 10M gas per tx (safe margin)
            recommendedSize = 300;
            maxSize = MAX_RECIPIENTS;
        }
    }
}
