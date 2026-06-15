const assert = require("node:assert/strict");
const { ethers } = require("hardhat");

describe("PiggyBulkTransfer", function () {
  it("does not recommend a batch size above the contract recipient limit", async function () {
    const PiggyBulkTransfer = await ethers.getContractFactory("PiggyBulkTransfer");
    const bulkTransfer = await PiggyBulkTransfer.deploy();

    const maxRecipients = await bulkTransfer.MAX_RECIPIENTS();
    const [, maxForNewHolders] = await bulkTransfer.getRecommendedBatchSize(true);
    const [, maxForExistingHolders] = await bulkTransfer.getRecommendedBatchSize(false);

    assert.ok(maxForNewHolders <= maxRecipients);
    assert.ok(maxForExistingHolders <= maxRecipients);
  });
});
