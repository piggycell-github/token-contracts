import pkg from "hardhat";
const { ethers } = pkg;
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

/**
 * PIGGY Token Bulk Transfer Script
 *
 * Usage:
 * 1. Create recipients.csv with format: address,amount (amount in PIGGY, not wei)
 * 2. Deploy PiggyBulkTransfer contract or use existing address
 * 3. Run: npx hardhat run scripts/bulk-transfer.js --network bsc_mainnet
 */

// Configuration
const CONFIG = {
  BATCH_SIZE: 200,
  DELAY_BETWEEN_BATCHES: 3000,
  GAS_LIMIT: 15_000_000,
  GAS_PRICE_GWEI: 3,
  PIGGY_TOKEN_ADDRESS: process.env.PIGGY_TOKEN_ADDRESS || "",
  BULK_TRANSFER_ADDRESS: process.env.BULK_TRANSFER_ADDRESS || "",
  RECIPIENTS_FILE: path.join(__dirname, "recipients.csv"),
  LOG_FILE: path.join(__dirname, "bulk-transfer-log.json"),
};

function parseRecipientsCSV(filePath) {
  if (!fs.existsSync(filePath)) {
    throw new Error(`Recipients file not found: ${filePath}`);
  }

  const content = fs.readFileSync(filePath, "utf-8");
  const lines = content.trim().split("\n");
  const startIndex = lines[0].toLowerCase().includes("address") ? 1 : 0;

  const recipients = [];
  for (let i = startIndex; i < lines.length; i++) {
    const line = lines[i].trim();
    if (!line) continue;

    let address, rawAmountStr;
    if (line.includes("\t")) {
      [address, rawAmountStr] = line.split("\t").map((s) => s.trim());
    } else {
      const firstCommaIndex = line.indexOf(",");
      address = line.substring(0, firstCommaIndex).trim();
      rawAmountStr = line.substring(firstCommaIndex + 1).trim();
    }
    const amountStr = rawAmountStr.replace(/,/g, "");

    if (!ethers.isAddress(address)) {
      throw new Error(`Invalid address at line ${i + 1}: ${address}`);
    }

    const amount = parseFloat(amountStr);
    if (isNaN(amount) || amount <= 0) {
      throw new Error(`Invalid amount at line ${i + 1}: ${amountStr}`);
    }

    recipients.push({
      address,
      amount: ethers.parseEther(amountStr),
    });
  }

  return recipients;
}

function splitIntoBatches(recipients, batchSize) {
  const batches = [];
  for (let i = 0; i < recipients.length; i += batchSize) {
    batches.push(recipients.slice(i, i + batchSize));
  }
  return batches;
}

function calculateTotalAmount(recipients) {
  return recipients.reduce((sum, r) => sum + r.amount, 0n);
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function saveLog(logData) {
  fs.writeFileSync(CONFIG.LOG_FILE, JSON.stringify(logData, null, 2));
}

function loadLog() {
  if (fs.existsSync(CONFIG.LOG_FILE)) {
    return JSON.parse(fs.readFileSync(CONFIG.LOG_FILE, "utf-8"));
  }
  return { completedBatches: [], failedBatches: [], startTime: Date.now() };
}

async function main() {
  console.log("=".repeat(60));
  console.log("PIGGY Token Bulk Transfer");
  console.log("=".repeat(60));

  if (!CONFIG.PIGGY_TOKEN_ADDRESS) {
    throw new Error("PIGGY_TOKEN_ADDRESS not set. Set it in .env or CONFIG");
  }
  if (!CONFIG.BULK_TRANSFER_ADDRESS) {
    throw new Error("BULK_TRANSFER_ADDRESS not set. Deploy PiggyBulkTransfer first");
  }

  const [signer] = await ethers.getSigners();
  console.log(`\nSender: ${signer.address}`);

  const piggyToken = await ethers.getContractAt("IERC20", CONFIG.PIGGY_TOKEN_ADDRESS);
  const bulkTransfer = await ethers.getContractAt("PiggyBulkTransfer", CONFIG.BULK_TRANSFER_ADDRESS);

  console.log(`\nLoading recipients from: ${CONFIG.RECIPIENTS_FILE}`);
  const recipients = parseRecipientsCSV(CONFIG.RECIPIENTS_FILE);
  console.log(`Total recipients: ${recipients.length}`);

  const totalAmount = calculateTotalAmount(recipients);
  console.log(`Total amount: ${ethers.formatEther(totalAmount)} PIGGY`);

  const senderBalance = await piggyToken.balanceOf(signer.address);
  console.log(`Sender balance: ${ethers.formatEther(senderBalance)} PIGGY`);

  if (senderBalance < totalAmount) {
    throw new Error(
      `Insufficient balance. Need ${ethers.formatEther(totalAmount)}, have ${ethers.formatEther(senderBalance)}`
    );
  }

  const batches = splitIntoBatches(recipients, CONFIG.BATCH_SIZE);
  console.log(`\nBatch configuration: ${CONFIG.BATCH_SIZE} recipients per batch`);
  console.log(`Total batches: ${batches.length}`);

  const currentAllowance = await piggyToken.allowance(signer.address, CONFIG.BULK_TRANSFER_ADDRESS);
  console.log(`\nCurrent allowance: ${ethers.formatEther(currentAllowance)} PIGGY`);

  if (currentAllowance < totalAmount) {
    console.log(`Approving ${ethers.formatEther(totalAmount)} PIGGY...`);
    const approveTx = await piggyToken.approve(CONFIG.BULK_TRANSFER_ADDRESS, totalAmount);
    await approveTx.wait();
    console.log(`Approval confirmed: ${approveTx.hash}`);
  }

  const log = loadLog();
  const completedBatchIndexes = new Set(log.completedBatches.map((b) => b.index));

  console.log("\n" + "=".repeat(60));
  console.log("Starting bulk transfers...");
  console.log("=".repeat(60));

  for (let i = 0; i < batches.length; i++) {
    if (completedBatchIndexes.has(i)) {
      console.log(`\nBatch ${i + 1}/${batches.length}: SKIPPED (already completed)`);
      continue;
    }

    const batch = batches[i];
    const batchAmount = calculateTotalAmount(batch);

    console.log(`\nBatch ${i + 1}/${batches.length}:`);
    console.log(`  Recipients: ${batch.length}`);
    console.log(`  Amount: ${ethers.formatEther(batchAmount)} PIGGY`);

    try {
      const addresses = batch.map((r) => r.address);
      const amounts = batch.map((r) => r.amount);

      const tx = await bulkTransfer.bulkTransfer(
        CONFIG.PIGGY_TOKEN_ADDRESS,
        addresses,
        amounts,
        { gasLimit: CONFIG.GAS_LIMIT }
      );

      console.log(`  Tx hash: ${tx.hash}`);
      const receipt = await tx.wait();
      console.log(`  Gas used: ${receipt.gasUsed.toString()}`);
      console.log(`  Status: SUCCESS`);

      log.completedBatches.push({
        index: i,
        txHash: tx.hash,
        gasUsed: receipt.gasUsed.toString(),
        recipients: batch.length,
        timestamp: Date.now(),
      });
      saveLog(log);

      if (i < batches.length - 1) {
        console.log(`  Waiting ${CONFIG.DELAY_BETWEEN_BATCHES}ms before next batch...`);
        await sleep(CONFIG.DELAY_BETWEEN_BATCHES);
      }
    } catch (error) {
      console.log(`  Status: FAILED`);
      console.log(`  Error: ${error.message}`);

      log.failedBatches.push({
        index: i,
        error: error.message,
        recipients: batch.length,
        timestamp: Date.now(),
      });
      saveLog(log);

      console.log("\nBatch failed. Check the error and re-run to resume.");
      break;
    }
  }

  console.log("\n" + "=".repeat(60));
  console.log("SUMMARY");
  console.log("=".repeat(60));
  console.log(`Completed batches: ${log.completedBatches.length}/${batches.length}`);
  console.log(`Failed batches: ${log.failedBatches.length}`);

  const totalGasUsed = log.completedBatches.reduce((sum, b) => sum + BigInt(b.gasUsed), 0n);
  console.log(`Total gas used: ${totalGasUsed.toString()}`);

  const totalTransferred = log.completedBatches.reduce((sum, b) => sum + b.recipients, 0);
  console.log(`Total recipients transferred: ${totalTransferred}`);

  if (log.failedBatches.length > 0) {
    console.log(`\nFailed batch indexes: ${log.failedBatches.map((b) => b.index).join(", ")}`);
    console.log("Re-run the script to resume from failed batches.");
  }

  console.log(`\nLog saved to: ${CONFIG.LOG_FILE}`);
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
