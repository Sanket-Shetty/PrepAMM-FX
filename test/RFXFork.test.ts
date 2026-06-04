import { expect } from "chai";
import { ethers } from "hardhat";

describe("RFXSettlement fork checks", function () {
  it("can read configured canonical token bytecode on a fork", async function () {
    const token = process.env.FORK_TOKEN_ADDRESS;
    if (!token) this.skip();

    const code = await ethers.provider.getCode(token);
    expect(code).to.not.equal("0x");
  });
});
