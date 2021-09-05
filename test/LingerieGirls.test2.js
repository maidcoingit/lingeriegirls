const { ethers } = require("hardhat");
const { expect } = require("chai");
const { BigNumber } = ethers;
const { mine } = require("./helpers/evm");
const { tokenAmount } = require("./helpers/ethers");

/**
    await network.provider.send("evm_setAutomine", [true]);
    await network.provider.send("evm_setAutomine", [false]);
 */

const INITIAL_REWARD_PER_BLOCK = tokenAmount(100);

const setupTest = async () => {
    const signers = await ethers.getSigners();
    const [deployer, alice, bob, carol, dan] = signers;

    const TestLPToken = await ethers.getContractFactory("TestLPToken");
    const lpToken = await TestLPToken.deploy();
    await mine();
    await lpToken.mint(alice.address, tokenAmount(1000));
    await lpToken.mint(bob.address, tokenAmount(1000));
    await lpToken.mint(carol.address, tokenAmount(1000));
    await lpToken.mint(dan.address, tokenAmount(10000));

    const MockSushiToken = await ethers.getContractFactory("MockSushiToken");
    const sushi = await MockSushiToken.deploy();
    await mine();

    const MockMasterChef = await ethers.getContractFactory("MockMasterChef");
    const mc = await MockMasterChef.deploy(sushi.address, deployer.address, INITIAL_REWARD_PER_BLOCK, 0, 0);
    await mine();

    const LingerieGirls = await ethers.getContractFactory("LingerieGirls");
    const lgirl = await LingerieGirls.deploy(lpToken.address, sushi.address);
    await mine();

    await lgirl.mint(1);
    await lgirl.mint(2);
    await lgirl.mint(3);
    await mine();

    await lgirl.transferFrom(deployer.address, alice.address, 0);
    await lgirl.transferFrom(deployer.address, bob.address, 1);
    await lgirl.transferFrom(deployer.address, carol.address, 2);
    await mine();

    await lpToken.connect(alice).approve(lgirl.address, ethers.constants.MaxUint256);
    await lpToken.connect(bob).approve(lgirl.address, ethers.constants.MaxUint256);
    await lpToken.connect(carol).approve(lgirl.address, ethers.constants.MaxUint256);
    await lpToken.connect(dan).approve(lgirl.address, ethers.constants.MaxUint256);

    await sushi.transferOwnership(mc.address);

    await mc.add(0, sushi.address, true);
    await mc.add(1, sushi.address, true);
    await mc.add(1, lpToken.address, true);
    await mine();

    return {
        deployer,
        alice,
        bob,
        carol,
        dan,
        lpToken,
        sushi,
        mc,
        lgirl,
    };
};

describe("LingerieGirls interact with MasterChef", function () {
    beforeEach(async function () {
        await ethers.provider.send("hardhat_reset", []);
    });

    it("overall test", async function () {
        const { alice, bob, carol, dan, lpToken, sushi, mc, lgirl } = await setupTest();
        await network.provider.send("evm_setAutomine", [true]);

        await lgirl.connect(alice).support(0, 100);
        await lgirl.connect(bob).support(1, 200);

        await mine();
        await mine();

        await lgirl.connect(bob).desupport(1, 100);
        await mine();

        await lgirl.connect(alice).support(0, 100); //200
        await lgirl.connect(bob).support(1, 200); //300

        expect(await lpToken.balanceOf(lgirl.address)).to.be.equal(500);

        await expect(lgirl.setSushiMasterChef(mc.address, 0)).to.be.reverted;
        await expect(lgirl.setSushiMasterChef(mc.address, 1)).to.be.reverted;

        await network.provider.send("evm_setAutomine", [false]);

        await lgirl.setSushiMasterChef(mc.address, 2);
        await lgirl.connect(carol).support(2, 500);
        await mine(); //ex) 10b

        await network.provider.send("evm_setAutomine", [true]);
        expect((await lgirl.lingerieGirls(2)).supportedLPTokenAmount).to.be.equal(500);
        expect((await mc.userInfo(2, lgirl.address)).amount).to.be.equal(1000);

        await mine(9); //ex) 19b mined
        await lgirl.connect(alice).support(0, 1000); //20b_totalReward tokenAmount(500)

        expect(await sushi.balanceOf(alice.address)).to.be.equal(tokenAmount(100));
        expect(await sushi.balanceOf(bob.address)).to.be.equal(0);
        expect(await sushi.balanceOf(carol.address)).to.be.equal(0);
        expect(await sushi.balanceOf(lgirl.address)).to.be.equal(tokenAmount(400));

        await lgirl.connect(bob).claimSushiReward(1); //21b_totalReward tokenAmount(550)

        expect(await sushi.balanceOf(alice.address)).to.be.equal(tokenAmount(100));
        const t75 = ethers.BigNumber.from(10).pow(17).mul(75);
        expect(await sushi.balanceOf(bob.address)).to.be.equal(tokenAmount(150).add(t75));
        expect(await sushi.balanceOf(carol.address)).to.be.equal(0);
        expect(await sushi.balanceOf(lgirl.address)).to.be.equal(tokenAmount(550).sub(tokenAmount(250).add(t75)));
        await expect(lgirl.connect(alice).desupport(0, 5000)).to.be.reverted;
        await network.provider.send("evm_setAutomine", [false]);
        await lgirl.connect(alice).desupport(0, 1000); //23b_totalReward tokenAmount(650)
        await lgirl.connect(carol).support(2, 1000); //23b_totalReward tokenAmount(650)
        await mine(); //23b

        expect(await sushi.balanceOf(alice.address)).to.be.equal(tokenAmount(190));
        const t125 = ethers.BigNumber.from(10).pow(17).mul(125);
        expect(await sushi.balanceOf(bob.address)).to.be.equal(tokenAmount(150).add(t75));
        expect(await sushi.balanceOf(carol.address)).to.be.equal(tokenAmount(250).add(t125).add(tokenAmount(25)));
        expect(await sushi.balanceOf(lgirl.address)).to.be.equal(tokenAmount(15));

        await lgirl.connect(bob).desupport(1, 300); //24b_totalReward tokenAmount(700)
        await mine(); //24b
        await network.provider.send("evm_setAutomine", [true]);
        expect(await sushi.balanceOf(bob.address)).to.be.equal(tokenAmount(180));

        // await lgirl.connect(bob).claimSushiReward(1);
        await expect(lgirl.connect(bob).claimSushiReward(1)).to.be.reverted;

        await network.provider.send("evm_setAutomine", [false]);
        await lgirl.connect(alice).desupport(0, 200); //26b_totalReward tokenAmount(800)
        await lgirl.connect(bob).support(1, 100); //26b_totalReward tokenAmount(800)
        await lgirl.connect(carol).support(2, 100); //26b_totalReward tokenAmount(800)
        await mine(); //26b

        await network.provider.send("evm_setAutomine", [true]);
        expect(await sushi.balanceOf(alice.address)).to.be.gt(tokenAmount(206));
        expect(await sushi.balanceOf(alice.address)).to.be.lt(tokenAmount(207));
        expect(await sushi.balanceOf(bob.address)).to.be.equal(tokenAmount(180));
        expect(await sushi.balanceOf(carol.address)).to.be.gt(tokenAmount(413));
        expect(await sushi.balanceOf(carol.address)).to.be.lt(tokenAmount(414));
        expect(await sushi.balanceOf(lgirl.address)).to.be.lte(1);

        await network.provider.send("evm_setAutomine", [false]);
        await lgirl.connect(bob).support(1, 200);
        await lgirl.connect(carol).support(2, 100);
        await mine();
        await network.provider.send("evm_setAutomine", [true]);
        await lgirl.connect(alice).support(0, 1200);

        await network.provider.send("evm_setAutomine", [false]);
        await mc.set(2, 0, true);
        await mine();

        const r1 = await lgirl.pendingSushiReward(0);
        const r2 = await lgirl.pendingSushiReward(1);
        const r3 = await lgirl.pendingSushiReward(2);

        await network.provider.send("evm_setAutomine", [true]);

        await expect(() => lgirl.connect(alice).claimSushiReward(0)).to.changeTokenBalance(sushi, alice, r1);
        await expect(() => lgirl.connect(bob).claimSushiReward(1)).to.changeTokenBalance(sushi, bob, r2);
        await expect(() => lgirl.connect(carol).claimSushiReward(2)).to.changeTokenBalance(sushi, carol, r3);
    });

    it.only("overall test2", async function () {
        const { alice, bob, carol, dan, lpToken, sushi, mc, lgirl } = await setupTest();
        await network.provider.send("evm_setAutomine", [true]);

        await lgirl.connect(alice).support(0, 100);
        await lgirl.connect(bob).support(1, 200);

        await mine();
        await mine();

        await lgirl.connect(bob).desupport(1, 100);
        await mine();

        await lgirl.connect(alice).support(0, 100); //200
        await lgirl.connect(bob).support(1, 200); //300

        expect(await lpToken.balanceOf(lgirl.address)).to.be.equal(500);

        await network.provider.send("evm_setAutomine", [false]);

        await lgirl.setSushiMasterChef(mc.address, 2);
        await lgirl.connect(carol).support(2, 500);
        await mine(); //ex) 10b

        await network.provider.send("evm_setAutomine", [true]);
        expect((await lgirl.lingerieGirls(2)).supportedLPTokenAmount).to.be.equal(500);
        expect((await mc.userInfo(2, lgirl.address)).amount).to.be.equal(1000);

        await mine(9); //ex) 19b mined
        await lgirl.connect(alice).support(0, 1000); //20b_totalReward tokenAmount(500)

        expect(await sushi.balanceOf(alice.address)).to.be.equal(tokenAmount(100));
        expect(await sushi.balanceOf(bob.address)).to.be.equal(0);
        expect(await sushi.balanceOf(carol.address)).to.be.equal(0);
        expect(await sushi.balanceOf(lgirl.address)).to.be.equal(tokenAmount(400));

        await lgirl.connect(bob).claimSushiReward(1); //21b_totalReward tokenAmount(550)

        expect(await sushi.balanceOf(alice.address)).to.be.equal(tokenAmount(100));
        const t75 = ethers.BigNumber.from(10).pow(17).mul(75);
        expect(await sushi.balanceOf(bob.address)).to.be.equal(tokenAmount(150).add(t75));
        expect(await sushi.balanceOf(carol.address)).to.be.equal(0);
        expect(await sushi.balanceOf(lgirl.address)).to.be.equal(tokenAmount(550).sub(tokenAmount(250).add(t75)));
        await expect(lgirl.connect(alice).desupport(0, 5000)).to.be.reverted;
        await network.provider.send("evm_setAutomine", [false]);
        await lgirl.connect(alice).desupport(0, 1000); //23b_totalReward tokenAmount(650)
        await lgirl.connect(carol).support(2, 1000); //23b_totalReward tokenAmount(650)
        await mine(); //23b
        await network.provider.send("evm_setAutomine", [true]);

        expect(await sushi.balanceOf(alice.address)).to.be.equal(tokenAmount(190));
        const t125 = ethers.BigNumber.from(10).pow(17).mul(125);
        expect(await sushi.balanceOf(bob.address)).to.be.equal(tokenAmount(150).add(t75));
        expect(await sushi.balanceOf(carol.address)).to.be.equal(tokenAmount(250).add(t125).add(tokenAmount(25)));
        expect(await sushi.balanceOf(lgirl.address)).to.be.equal(tokenAmount(15));

        await lgirl.connect(bob).desupport(1, 300); //24b_totalReward tokenAmount(700)
        await network.provider.send("evm_setAutomine", [true]);
        expect(await sushi.balanceOf(bob.address)).to.be.equal(tokenAmount(180));

        // await lgirl.connect(bob).claimSushiReward(1);
        await expect(lgirl.connect(bob).claimSushiReward(1)).to.be.reverted;

        await network.provider.send("evm_setAutomine", [false]);
        await lgirl.connect(alice).desupport(0, 200); //26b_totalReward tokenAmount(800)
        await lgirl.connect(bob).support(1, 100); //26b_totalReward tokenAmount(800)
        await lgirl.connect(carol).support(2, 100); //26b_totalReward tokenAmount(800)
        await mine(); //26b

        await network.provider.send("evm_setAutomine", [true]);
        expect(await sushi.balanceOf(alice.address)).to.be.gt(tokenAmount(206));
        expect(await sushi.balanceOf(alice.address)).to.be.lt(tokenAmount(207));
        expect(await sushi.balanceOf(bob.address)).to.be.equal(tokenAmount(180));
        expect(await sushi.balanceOf(carol.address)).to.be.gt(tokenAmount(413));
        expect(await sushi.balanceOf(carol.address)).to.be.lt(tokenAmount(414));
        expect(await sushi.balanceOf(lgirl.address)).to.be.lte(1);

        await network.provider.send("evm_setAutomine", [false]);
        await lgirl.connect(bob).support(1, 200);
        await lgirl.connect(carol).support(2, 100);
        await mine();
        await network.provider.send("evm_setAutomine", [true]);
        await lgirl.connect(alice).support(0, 1200);

        await network.provider.send("evm_setAutomine", [false]);
        // console.log((await lgirl.lingerieGirls(0)).supportedLPTokenAmount.toString());
        // console.log((await lgirl.lingerieGirls(1)).supportedLPTokenAmount.toString());
        // console.log((await lgirl.lingerieGirls(2)).supportedLPTokenAmount.toString());
        await lgirl.connect(alice).desupport(0, 1000); // lgirl_0 : 200
        await lgirl.connect(bob).claimSushiReward(1); // lgirl_1 : 300
        await lgirl.connect(carol).desupport(2, 1200); //lgirl_2 : 500
        await mine(2);

        await mc.set(2, 0, true);
        await mc.add(9, lpToken.address, true);
        await mine();

        const r1 = await lgirl.pendingSushiReward(0);
        const r2 = await lgirl.pendingSushiReward(1);
        const r3 = await lgirl.pendingSushiReward(2);

        expect(r1).to.be.equal(tokenAmount(20));
        expect(r2).to.be.equal(tokenAmount(30));
        expect(r3).to.be.equal(tokenAmount(50));

        await network.provider.send("evm_setAutomine", [true]);
        await expect(() => lgirl.connect(alice).claimSushiReward(0)).to.changeTokenBalance(sushi, alice, r1);
        await expect(() => lgirl.connect(bob).claimSushiReward(1)).to.changeTokenBalance(sushi, bob, r2);

        await mine(5);

        expect(await lgirl.pendingSushiReward(0)).to.be.equal(0);
        expect(await lgirl.pendingSushiReward(1)).to.be.equal(0);

        await expect(lgirl.connect(alice).claimSushiReward(0)).to.be.revertedWith(
            "MasterChefModule: Nothing can be claimed"
        );
        await expect(lgirl.connect(bob).claimSushiReward(1)).to.be.revertedWith(
            "MasterChefModule: Nothing can be claimed"
        );

        expect((await mc.userInfo(2, lgirl.address)).amount).to.be.equal(1000);
        expect((await mc.userInfo(3, lgirl.address)).amount).to.be.equal(0);

        await lgirl.setSushiMasterChef(mc.address, 3);

        expect((await mc.userInfo(2, lgirl.address)).amount).to.be.equal(0);
        expect((await mc.userInfo(3, lgirl.address)).amount).to.be.equal(1000);

        await mine();
        await mc.set(3, 0, true);
        await network.provider.send("evm_setAutomine", [false]);
        expect((await lgirl.lingerieGirls(0)).supportedLPTokenAmount).to.be.equal(200);
        expect((await lgirl.lingerieGirls(1)).supportedLPTokenAmount).to.be.equal(300);
        expect((await lgirl.lingerieGirls(2)).supportedLPTokenAmount).to.be.equal(500);

        const r4 = await lgirl.pendingSushiReward(0);
        const r5 = await lgirl.pendingSushiReward(1);
        const r6 = await lgirl.pendingSushiReward(2);

        expect(r4).to.be.equal(tokenAmount(36));
        expect(r5).to.be.equal(tokenAmount(54));
        expect(r6).to.be.equal(tokenAmount(90).add(tokenAmount(50))); //+50 from 288 line

        await network.provider.send("evm_setAutomine", [true]);
        await expect(() => lgirl.connect(alice).claimSushiReward(0)).to.changeTokenBalance(sushi, alice, r4);
        await expect(() => lgirl.connect(bob).claimSushiReward(1)).to.changeTokenBalance(sushi, bob, r5);
        await expect(() => lgirl.connect(carol).claimSushiReward(2)).to.changeTokenBalance(sushi, carol, r6);

        //additional
        await mc.set(3, 100, true);
        const b0 = await sushi.balanceOf(alice.address);
        await network.provider.send("evm_setAutomine", [false]);
        await lgirl.connect(alice).desupport(0, 1);
        await lgirl.connect(alice).claimSushiReward(0);
        await lgirl.connect(alice).support(0, 2);
        await mine();
        expect((await lgirl.lingerieGirls(0)).supportedLPTokenAmount).to.be.equal(201);
        const diff0 = INITIAL_REWARD_PER_BLOCK.mul(100).div(101).mul(2).div(10);
        expect(await sushi.balanceOf(alice.address)).to.be.equal(b0.add(diff0));
        
        await lpToken.connect(dan).approve(mc.address, ethers.constants.MaxUint256);
        await mine();
        await network.provider.send("evm_setAutomine", [true]);
        await mc.connect(dan).deposit(3, (await mc.userInfo(3, lgirl.address)).amount);
        expect((await mc.userInfo(3, lgirl.address)).amount).to.be.equal((await mc.userInfo(3, dan.address)).amount);
        let sushiPerBlock = INITIAL_REWARD_PER_BLOCK.mul(100).div(101);
        const diff1 = sushiPerBlock.mul(2).mul(201).div(1001).add(sushiPerBlock.mul(201).div(2002));
        await expect(() => lgirl.connect(alice).claimSushiReward(0)).to.changeTokenBalance(sushi, alice, diff1.add(1)); //due to solidity math

        await network.provider.send("evm_setAutomine", [false]);
        await mc.connect(dan).deposit(3, (await mc.userInfo(3, lgirl.address)).amount);
        await lgirl.connect(alice).claimSushiReward(0);
        await expect(() => mine()).to.changeTokenBalance(sushi, alice, sushiPerBlock.mul(201).div(2002));
        await mine();
    });

    it("mintBatch test1", async function () {
        const TestLPToken = await ethers.getContractFactory("TestLPToken");
        const token = await TestLPToken.deploy();

        const LingerieGirls = await ethers.getContractFactory("LingerieGirls");
        const lgirl = await LingerieGirls.deploy(token.address, token.address);
        await mine();

        await expect(lgirl.mintBatch([1, 2, 3], 2)).to.be.revertedWith("LingerieGirls: Invalid parameters");

        expect(await lgirl.totalSupply()).to.be.equal(0);

        await lgirl.mintBatch([2, 4, 6, 8, 10], 5);

        expect(await lgirl.totalSupply()).to.be.equal(5);

        expect(await lgirl.powerOf(0)).to.be.equal(2);
        expect(await lgirl.powerOf(1)).to.be.equal(4);
        expect(await lgirl.powerOf(2)).to.be.equal(6);
        expect(await lgirl.powerOf(3)).to.be.equal(8);
        expect(await lgirl.powerOf(4)).to.be.equal(10);
    });

    it("mintBatch test2", async function () {
        const { lgirl } = await setupTest();

        expect(await lgirl.totalSupply()).to.be.equal(3);

        await lgirl.mintBatch([12, 14, 16, 18, 10], 5);

        expect(await lgirl.totalSupply()).to.be.equal(8);

        expect(await lgirl.powerOf(0)).to.be.equal(1);
        expect(await lgirl.powerOf(1)).to.be.equal(2);
        expect(await lgirl.powerOf(2)).to.be.equal(3);

        expect(await lgirl.powerOf(3)).to.be.equal(12);
        expect(await lgirl.powerOf(4)).to.be.equal(14);
        expect(await lgirl.powerOf(5)).to.be.equal(16);
        expect(await lgirl.powerOf(6)).to.be.equal(18);
        expect(await lgirl.powerOf(7)).to.be.equal(10);
    });
});
