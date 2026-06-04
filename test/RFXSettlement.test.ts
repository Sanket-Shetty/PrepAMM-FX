import { expect } from "chai";
import { ethers } from "hardhat";
import { time } from "@nomicfoundation/hardhat-network-helpers";

describe("RFXSettlement", function () {
  async function fixture() {
    const [admin, treasury, maker, taker, outsider] = await ethers.getSigners();

    const Token = await ethers.getContractFactory("MockERC20Permit");
    const eure = await Token.deploy("Monerium EURe", "EURe", 18);
    const usdc = await Token.deploy("USD Coin", "USDC", 6);

    const Registry = await ethers.getContractFactory("RFXRegistry");
    const registry = await Registry.deploy(admin.address, treasury.address, maker.address);

    const Settlement = await ethers.getContractFactory("RFXSettlement");
    const settlement = await Settlement.deploy(admin.address, await registry.getAddress());

    await registry.setTokenWhitelisted(await eure.getAddress(), true);
    await registry.setTokenWhitelisted(await usdc.getAddress(), true);

    await eure.mint(taker.address, ethers.parseEther("1000"));
    await usdc.mint(maker.address, ethers.parseUnits("1200", 6));
    await eure.connect(taker).approve(await settlement.getAddress(), ethers.MaxUint256);
    await usdc.connect(maker).approve(await settlement.getAddress(), ethers.MaxUint256);

    return { admin, treasury, maker, taker, outsider, eure, usdc, registry, settlement };
  }

  async function signOrder(settlement: any, signer: any, order: any) {
    const domain = {
      name: "PrepAMM FX RFQ",
      version: "1",
      chainId: order.chainId,
      verifyingContract: await settlement.getAddress()
    };
    const types = {
      RFQOrder: [
        { name: "maker", type: "address" },
        { name: "taker", type: "address" },
        { name: "inputToken", type: "address" },
        { name: "outputToken", type: "address" },
        { name: "inputAmount", type: "uint256" },
        { name: "outputAmount", type: "uint256" },
        { name: "expiry", type: "uint256" },
        { name: "nonce", type: "uint256" },
        { name: "chainId", type: "uint256" },
        { name: "feeBps", type: "uint256" }
      ]
    };
    return signer.signTypedData(domain, types, order);
  }

  it("settles a signed RFQ and routes the 10 bps input fee to treasury", async function () {
    const { treasury, maker, taker, eure, usdc, settlement } = await fixture();
    const chainId = (await ethers.provider.getNetwork()).chainId;
    const order = {
      maker: maker.address,
      taker: taker.address,
      inputToken: await eure.getAddress(),
      outputToken: await usdc.getAddress(),
      inputAmount: ethers.parseEther("100"),
      outputAmount: ethers.parseUnits("108", 6),
      expiry: await time.latest() + 600,
      nonce: 1,
      chainId,
      feeBps: 10
    };
    const signature = await signOrder(settlement, maker, order);

    await expect(settlement.connect(taker).settleRFQ(order, signature)).to.emit(settlement, "RFQSettled");

    expect(await eure.balanceOf(treasury.address)).to.equal(ethers.parseEther("0.1"));
    expect(await eure.balanceOf(maker.address)).to.equal(ethers.parseEther("99.9"));
    expect(await usdc.balanceOf(taker.address)).to.equal(ethers.parseUnits("108", 6));
  });

  it("rejects replayed nonces", async function () {
    const { maker, taker, eure, usdc, settlement } = await fixture();
    const chainId = (await ethers.provider.getNetwork()).chainId;
    const order = {
      maker: maker.address,
      taker: taker.address,
      inputToken: await eure.getAddress(),
      outputToken: await usdc.getAddress(),
      inputAmount: ethers.parseEther("10"),
      outputAmount: ethers.parseUnits("11", 6),
      expiry: await time.latest() + 600,
      nonce: 42,
      chainId,
      feeBps: 10
    };
    const signature = await signOrder(settlement, maker, order);

    await settlement.connect(taker).settleRFQ(order, signature);
    await expect(settlement.connect(taker).settleRFQ(order, signature)).to.be.revertedWithCustomError(
      settlement,
      "NonceAlreadyUsed"
    );
  });

  it("rejects signatures from untrusted makers", async function () {
    const { outsider, taker, eure, usdc, settlement } = await fixture();
    const chainId = (await ethers.provider.getNetwork()).chainId;
    const order = {
      maker: outsider.address,
      taker: taker.address,
      inputToken: await eure.getAddress(),
      outputToken: await usdc.getAddress(),
      inputAmount: ethers.parseEther("10"),
      outputAmount: ethers.parseUnits("11", 6),
      expiry: await time.latest() + 600,
      nonce: 99,
      chainId,
      feeBps: 10
    };
    const signature = await signOrder(settlement, outsider, order);

    await expect(settlement.connect(taker).settleRFQ(order, signature)).to.be.revertedWithCustomError(
      settlement,
      "InvalidSignature"
    );
  });
});
