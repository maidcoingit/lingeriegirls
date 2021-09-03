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
    await lpToken.mint(dan.address, tokenAmount(1000));

    const MockSushiToken = await ethers.getContractFactory("MockSushiToken");
    const sushi = await MockSushiToken.deploy();
    await mine();

    const MockMasterChef = await ethers.getContractFactory("MockMasterChef");
    const mc = await MockMasterChef.deploy(sushi.address, deployer.address, INITIAL_REWARD_PER_BLOCK, 0, 0);
    await mine();

    const LingerieGirls = await ethers.getContractFactory("LingerieGirls");
    const sgirl = await LingerieGirls.deploy(lpToken.address, sushi.address);
    await mine();

    await sgirl.mint(1);
    await sgirl.mint(2);
    await sgirl.mint(3);
    await mine();

    await sgirl.transferFrom(deployer.address, alice.address, 0);
    await sgirl.transferFrom(deployer.address, bob.address, 1);
    await sgirl.transferFrom(deployer.address, carol.address, 2);
    await mine();

    await lpToken.connect(alice).approve(mc.address, ethers.constants.MaxUint256);
    await lpToken.connect(bob).approve(mc.address, ethers.constants.MaxUint256);
    await lpToken.connect(carol).approve(mc.address, ethers.constants.MaxUint256);
    await lpToken.connect(dan).approve(mc.address, ethers.constants.MaxUint256);

    await lpToken.connect(alice).approve(sgirl.address, ethers.constants.MaxUint256);
    await lpToken.connect(bob).approve(sgirl.address, ethers.constants.MaxUint256);
    await lpToken.connect(carol).approve(sgirl.address, ethers.constants.MaxUint256);
    await lpToken.connect(dan).approve(sgirl.address, ethers.constants.MaxUint256);

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
        sgirl,
    };
};

describe("LingerieGirls interact with MasterChef", function () {
    beforeEach(async function () {
        await ethers.provider.send("hardhat_reset", []);
    });

    it("overall test", async function () {
        const { alice, bob, carol, dan, lpToken, sushi, mc, sgirl } = await setupTest();
        await network.provider.send("evm_setAutomine", [true]);

        await sgirl.connect(alice).support(0, 100);
        await sgirl.connect(bob).support(1, 200);

        await mine();
        await mine();

        await sgirl.connect(bob).desupport(1, 100);
        await mine();

        await sgirl.connect(alice).support(0, 100); //200
        await sgirl.connect(bob).support(1, 200); //300

        expect(await lpToken.balanceOf(sgirl.address)).to.be.equal(500);

        await expect(sgirl.setSushiMasterChef(mc.address, 0)).to.be.reverted;
        await expect(sgirl.setSushiMasterChef(mc.address, 1)).to.be.reverted;

        await network.provider.send("evm_setAutomine", [false]);

        await sgirl.setSushiMasterChef(mc.address, 2);
        await sgirl.connect(carol).support(2, 500);
        await mine(); //ex) 10b

        await network.provider.send("evm_setAutomine", [true]);
        expect((await sgirl.lingerieGirls(2)).supportedLPTokenAmount).to.be.equal(500);
        expect((await mc.userInfo(2, sgirl.address)).amount).to.be.equal(1000);

        await mine(9); //ex) 19b mined
        await sgirl.connect(alice).support(0, 1000); //20b_totalReward tokenAmount(500)

        expect(await sushi.balanceOf(alice.address)).to.be.equal(tokenAmount(100));
        expect(await sushi.balanceOf(bob.address)).to.be.equal(0);
        expect(await sushi.balanceOf(carol.address)).to.be.equal(0);
        expect(await sushi.balanceOf(sgirl.address)).to.be.equal(tokenAmount(400));

        await sgirl.connect(bob).claimSushiReward(1); //21b_totalReward tokenAmount(550)

        expect(await sushi.balanceOf(alice.address)).to.be.equal(tokenAmount(100));
        const t75 = ethers.BigNumber.from(10).pow(17).mul(75);
        expect(await sushi.balanceOf(bob.address)).to.be.equal(tokenAmount(150).add(t75));
        expect(await sushi.balanceOf(carol.address)).to.be.equal(0);
        expect(await sushi.balanceOf(sgirl.address)).to.be.equal(tokenAmount(550).sub(tokenAmount(250).add(t75)));
        await expect(sgirl.connect(alice).desupport(0, 5000)).to.be.reverted;
        await network.provider.send("evm_setAutomine", [false]);
        await sgirl.connect(alice).desupport(0, 1000); //23b_totalReward tokenAmount(650)
        await sgirl.connect(carol).support(2, 1000); //23b_totalReward tokenAmount(650)
        await mine(); //23b

        expect(await sushi.balanceOf(alice.address)).to.be.equal(tokenAmount(190));
        const t125 = ethers.BigNumber.from(10).pow(17).mul(125);
        expect(await sushi.balanceOf(bob.address)).to.be.equal(tokenAmount(150).add(t75));
        expect(await sushi.balanceOf(carol.address)).to.be.equal(tokenAmount(250).add(t125).add(tokenAmount(25)));
        expect(await sushi.balanceOf(sgirl.address)).to.be.equal(tokenAmount(15));

        await sgirl.connect(bob).desupport(1, 300); //24b_totalReward tokenAmount(700)
        await mine(); //24b
        await network.provider.send("evm_setAutomine", [true]);
        expect(await sushi.balanceOf(bob.address)).to.be.equal(tokenAmount(180));

        // await sgirl.connect(bob).claimSushiReward(1);
        await expect(sgirl.connect(bob).claimSushiReward(1)).to.be.reverted;

        await network.provider.send("evm_setAutomine", [false]);
        await sgirl.connect(alice).desupport(0, 200); //26b_totalReward tokenAmount(800)
        await sgirl.connect(bob).support(1, 100); //26b_totalReward tokenAmount(800)
        await sgirl.connect(carol).support(2, 100); //26b_totalReward tokenAmount(800)
        await mine(); //26b

        await network.provider.send("evm_setAutomine", [true]);
        expect(await sushi.balanceOf(alice.address)).to.be.gt(tokenAmount(206));
        expect(await sushi.balanceOf(alice.address)).to.be.lt(tokenAmount(207));
        expect(await sushi.balanceOf(bob.address)).to.be.equal(tokenAmount(180));
        expect(await sushi.balanceOf(carol.address)).to.be.gt(tokenAmount(413));
        expect(await sushi.balanceOf(carol.address)).to.be.lt(tokenAmount(414));
        expect(await sushi.balanceOf(sgirl.address)).to.be.lte(1);

        await network.provider.send("evm_setAutomine", [false]);
        await sgirl.connect(bob).support(1, 200);
        await sgirl.connect(carol).support(2, 100);
        await mine();
        await network.provider.send("evm_setAutomine", [true]);
        await sgirl.connect(alice).support(0, 1200);

        await network.provider.send("evm_setAutomine", [false]);
        await mc.set(2, 0, true);
        await mine();

        const r1 = await sgirl.pendingSushiReward(0);
        const r2 = await sgirl.pendingSushiReward(1);
        const r3 = await sgirl.pendingSushiReward(2);

        await network.provider.send("evm_setAutomine", [true]);

        await expect(() => sgirl.connect(alice).claimSushiReward(0)).to.changeTokenBalance(sushi, alice, r1);
        await expect(() => sgirl.connect(bob).claimSushiReward(1)).to.changeTokenBalance(sushi, bob, r2);
        await expect(() => sgirl.connect(carol).claimSushiReward(2)).to.changeTokenBalance(sushi, carol, r3);
    });

    it("overall test2", async function () {
        const { alice, bob, carol, lpToken, sushi, mc, sgirl } = await setupTest();
        await network.provider.send("evm_setAutomine", [true]);

        await sgirl.connect(alice).support(0, 100);
        await sgirl.connect(bob).support(1, 200);

        await mine();
        await mine();

        await sgirl.connect(bob).desupport(1, 100);
        await mine();

        await sgirl.connect(alice).support(0, 100); //200
        await sgirl.connect(bob).support(1, 200); //300

        expect(await lpToken.balanceOf(sgirl.address)).to.be.equal(500);

        await network.provider.send("evm_setAutomine", [false]);

        await sgirl.setSushiMasterChef(mc.address, 2);
        await sgirl.connect(carol).support(2, 500);
        await mine(); //ex) 10b

        await network.provider.send("evm_setAutomine", [true]);
        expect((await sgirl.lingerieGirls(2)).supportedLPTokenAmount).to.be.equal(500);
        expect((await mc.userInfo(2, sgirl.address)).amount).to.be.equal(1000);

        await mine(9); //ex) 19b mined
        await sgirl.connect(alice).support(0, 1000); //20b_totalReward tokenAmount(500)

        expect(await sushi.balanceOf(alice.address)).to.be.equal(tokenAmount(100));
        expect(await sushi.balanceOf(bob.address)).to.be.equal(0);
        expect(await sushi.balanceOf(carol.address)).to.be.equal(0);
        expect(await sushi.balanceOf(sgirl.address)).to.be.equal(tokenAmount(400));

        await sgirl.connect(bob).claimSushiReward(1); //21b_totalReward tokenAmount(550)

        expect(await sushi.balanceOf(alice.address)).to.be.equal(tokenAmount(100));
        const t75 = ethers.BigNumber.from(10).pow(17).mul(75);
        expect(await sushi.balanceOf(bob.address)).to.be.equal(tokenAmount(150).add(t75));
        expect(await sushi.balanceOf(carol.address)).to.be.equal(0);
        expect(await sushi.balanceOf(sgirl.address)).to.be.equal(tokenAmount(550).sub(tokenAmount(250).add(t75)));
        await expect(sgirl.connect(alice).desupport(0, 5000)).to.be.reverted;
        await network.provider.send("evm_setAutomine", [false]);
        await sgirl.connect(alice).desupport(0, 1000); //23b_totalReward tokenAmount(650)
        await sgirl.connect(carol).support(2, 1000); //23b_totalReward tokenAmount(650)
        await mine(); //23b

        expect(await sushi.balanceOf(alice.address)).to.be.equal(tokenAmount(190));
        const t125 = ethers.BigNumber.from(10).pow(17).mul(125);
        expect(await sushi.balanceOf(bob.address)).to.be.equal(tokenAmount(150).add(t75));
        expect(await sushi.balanceOf(carol.address)).to.be.equal(tokenAmount(250).add(t125).add(tokenAmount(25)));
        expect(await sushi.balanceOf(sgirl.address)).to.be.equal(tokenAmount(15));

        await sgirl.connect(bob).desupport(1, 300); //24b_totalReward tokenAmount(700)
        await mine(); //24b
        await network.provider.send("evm_setAutomine", [true]);
        expect(await sushi.balanceOf(bob.address)).to.be.equal(tokenAmount(180));

        // await sgirl.connect(bob).claimSushiReward(1);
        await expect(sgirl.connect(bob).claimSushiReward(1)).to.be.reverted;

        await network.provider.send("evm_setAutomine", [false]);
        await sgirl.connect(alice).desupport(0, 200); //26b_totalReward tokenAmount(800)
        await sgirl.connect(bob).support(1, 100); //26b_totalReward tokenAmount(800)
        await sgirl.connect(carol).support(2, 100); //26b_totalReward tokenAmount(800)
        await mine(); //26b

        await network.provider.send("evm_setAutomine", [true]);
        expect(await sushi.balanceOf(alice.address)).to.be.gt(tokenAmount(206));
        expect(await sushi.balanceOf(alice.address)).to.be.lt(tokenAmount(207));
        expect(await sushi.balanceOf(bob.address)).to.be.equal(tokenAmount(180));
        expect(await sushi.balanceOf(carol.address)).to.be.gt(tokenAmount(413));
        expect(await sushi.balanceOf(carol.address)).to.be.lt(tokenAmount(414));
        expect(await sushi.balanceOf(sgirl.address)).to.be.lte(1);

        await network.provider.send("evm_setAutomine", [false]);
        await sgirl.connect(bob).support(1, 200);
        await sgirl.connect(carol).support(2, 100);
        await mine();
        await network.provider.send("evm_setAutomine", [true]);
        await sgirl.connect(alice).support(0, 1200);

        await network.provider.send("evm_setAutomine", [false]);
        // console.log((await sgirl.lingerieGirls(0)).supportedLPTokenAmount.toString());
        // console.log((await sgirl.lingerieGirls(1)).supportedLPTokenAmount.toString());
        // console.log((await sgirl.lingerieGirls(2)).supportedLPTokenAmount.toString());
        await sgirl.connect(alice).desupport(0, 1000); // sgirl_0 : 200
        await sgirl.connect(bob).claimSushiReward(1); // sgirl_1 : 300
        await sgirl.connect(carol).desupport(2, 1200); //sgirl_2 : 500
        await mine(2);

        await mc.set(2, 0, true);
        await mc.add(9, lpToken.address, true);
        await mine();

        const r1 = await sgirl.pendingSushiReward(0);
        const r2 = await sgirl.pendingSushiReward(1);
        const r3 = await sgirl.pendingSushiReward(2);

        expect(r1).to.be.equal(tokenAmount(20));
        expect(r2).to.be.equal(tokenAmount(30));
        expect(r3).to.be.equal(tokenAmount(50));

        await network.provider.send("evm_setAutomine", [true]);
        await expect(() => sgirl.connect(alice).claimSushiReward(0)).to.changeTokenBalance(sushi, alice, r1);
        await expect(() => sgirl.connect(bob).claimSushiReward(1)).to.changeTokenBalance(sushi, bob, r2);

        await mine(5);

        expect(await sgirl.pendingSushiReward(0)).to.be.equal(0);
        expect(await sgirl.pendingSushiReward(1)).to.be.equal(0);

        await expect(sgirl.connect(alice).claimSushiReward(0)).to.be.revertedWith("LingerieGirls: Nothing can be claimed");
        await expect(sgirl.connect(bob).claimSushiReward(1)).to.be.revertedWith("LingerieGirls: Nothing can be claimed");

        expect((await mc.userInfo(2, sgirl.address)).amount).to.be.equal(1000);
        expect((await mc.userInfo(3, sgirl.address)).amount).to.be.equal(0);
        
        await sgirl.setSushiMasterChef(mc.address, 3);
        
        expect((await mc.userInfo(2, sgirl.address)).amount).to.be.equal(0);
        expect((await mc.userInfo(3, sgirl.address)).amount).to.be.equal(1000);

        await mine();
        await mc.set(3, 0, true);
        await network.provider.send("evm_setAutomine", [false]);
        expect((await sgirl.lingerieGirls(0)).supportedLPTokenAmount).to.be.equal(200);
        expect((await sgirl.lingerieGirls(1)).supportedLPTokenAmount).to.be.equal(300);
        expect((await sgirl.lingerieGirls(2)).supportedLPTokenAmount).to.be.equal(500);

        const r4 = await sgirl.pendingSushiReward(0);
        const r5 = await sgirl.pendingSushiReward(1);
        const r6 = await sgirl.pendingSushiReward(2);

        expect(r4).to.be.equal(tokenAmount(36));
        expect(r5).to.be.equal(tokenAmount(54));
        expect(r6).to.be.equal(tokenAmount(90).add(tokenAmount(50)));    //+50 from 288 line

        await network.provider.send("evm_setAutomine", [true]);
        await expect(() => sgirl.connect(alice).claimSushiReward(0)).to.changeTokenBalance(sushi, alice, r4);
        await expect(() => sgirl.connect(bob).claimSushiReward(1)).to.changeTokenBalance(sushi, bob, r5);
        await expect(() => sgirl.connect(carol).claimSushiReward(2)).to.changeTokenBalance(sushi, carol, r6);
    });

    it("mintBatch test1", async function () {
        const TestLPToken = await ethers.getContractFactory("TestLPToken");
        const token = await TestLPToken.deploy();
    
        const LingerieGirls = await ethers.getContractFactory("LingerieGirls");
        const sgirl = await LingerieGirls.deploy(token.address, token.address);
        await mine();

        await expect(sgirl.mintBatch([1,2,3], 2)).to.be.revertedWith("LingerieGirls: Invalid parameters");

        expect(await sgirl.totalSupply()).to.be.equal(0);
        
        await sgirl.mintBatch([2,4,6,8,10],5);

        expect(await sgirl.totalSupply()).to.be.equal(5);
        
        expect(await sgirl.powerOf(0)).to.be.equal(2);
        expect(await sgirl.powerOf(1)).to.be.equal(4);
        expect(await sgirl.powerOf(2)).to.be.equal(6);
        expect(await sgirl.powerOf(3)).to.be.equal(8);
        expect(await sgirl.powerOf(4)).to.be.equal(10);
    });

    it("mintBatch test2", async function () {
        const { sgirl } = await setupTest();

        expect(await sgirl.totalSupply()).to.be.equal(3);
        
        await sgirl.mintBatch([12,14,16,18,10],5);

        expect(await sgirl.totalSupply()).to.be.equal(8);
        
        expect(await sgirl.powerOf(0)).to.be.equal(1);
        expect(await sgirl.powerOf(1)).to.be.equal(2);
        expect(await sgirl.powerOf(2)).to.be.equal(3);
        
        expect(await sgirl.powerOf(3)).to.be.equal(12);
        expect(await sgirl.powerOf(4)).to.be.equal(14);
        expect(await sgirl.powerOf(5)).to.be.equal(16);
        expect(await sgirl.powerOf(6)).to.be.equal(18);
        expect(await sgirl.powerOf(7)).to.be.equal(10);
    });
});
