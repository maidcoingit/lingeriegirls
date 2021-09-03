import { expect } from "chai";
import { ecsign } from "ethereumjs-util";
import { BigNumber, constants } from "ethers";
import { defaultAbiCoder, hexlify, keccak256, toUtf8Bytes } from "ethers/lib/utils";
import { waffle } from "hardhat";
import LingerieGirlsArtifact from "../artifacts/contracts/LingerieGirls.sol/LingerieGirls.json";
import MockSushiTokenArtifact from "../artifacts/contracts/test/MockSushiToken.sol/MockSushiToken.json";
import TestLPTokenArtifact from "../artifacts/contracts/test/TestLPToken.sol/TestLPToken.json";
import { MockSushiToken, LingerieGirls, TestLPToken } from "../typechain";
import { expandTo18Decimals } from "./shared/utils/number";
import { getERC721ApprovalDigest } from "./shared/utils/standard";

const { deployContract } = waffle;

describe("LingerieGirls", () => {
    let testLPToken: TestLPToken;
    let sushi: MockSushiToken;
    let lingerieGirls: LingerieGirls;

    const provider = waffle.provider;
    const [admin, other] = provider.getWallets();

    beforeEach(async () => {

        testLPToken = await deployContract(
            admin,
            TestLPTokenArtifact,
            []
        ) as TestLPToken;

        sushi = await deployContract(
            admin,
            MockSushiTokenArtifact,
            []
        ) as MockSushiToken;

        lingerieGirls = await deployContract(
            admin,
            LingerieGirlsArtifact,
            [testLPToken.address, sushi.address]
        ) as LingerieGirls;
    })

    context("new LingerieGirls", async () => {
        it("name, symbol, DOMAIN_SEPARATOR, PERMIT_TYPEHASH", async () => {
            const name = await lingerieGirls.name()
            expect(name).to.eq("MaidCoin Lingerie Girls")
            expect(await lingerieGirls.symbol()).to.eq("LINGERIEGIRLS")
            expect(await lingerieGirls.DOMAIN_SEPARATOR()).to.eq(
                keccak256(
                    defaultAbiCoder.encode(
                        ["bytes32", "bytes32", "bytes32", "uint256", "address"],
                        [
                            keccak256(
                                toUtf8Bytes("EIP712Domain(string name,string version,uint256 chainId,address verifyingContract)")
                            ),
                            keccak256(toUtf8Bytes(name)),
                            keccak256(toUtf8Bytes("1")),
                            31337,
                            lingerieGirls.address
                        ]
                    )
                )
            )
            expect(await lingerieGirls.PERMIT_TYPEHASH()).to.eq(
                keccak256(toUtf8Bytes("Permit(address spender,uint256 tokenId,uint256 nonce,uint256 deadline)"))
            )
        })

        it("changeLPTokenToLingerieGirlPower", async () => {
            expect(await lingerieGirls.lpTokenToLingerieGirlPower()).to.eq(BigNumber.from(1))
            await expect(lingerieGirls.changeLPTokenToLingerieGirlPower(BigNumber.from(2)))
                .to.emit(lingerieGirls, "ChangeLPTokenToLingerieGirlPower")
                .withArgs(BigNumber.from(2))
            expect(await lingerieGirls.lpTokenToLingerieGirlPower()).to.eq(BigNumber.from(2))
        })

        it("mint, powerOf", async () => {

            const id = BigNumber.from(0);
            const power = BigNumber.from(12);

            await expect(lingerieGirls.mint(power))
                .to.emit(lingerieGirls, "Transfer")
                .withArgs(constants.AddressZero, admin.address, id)
            expect(await lingerieGirls.powerOf(id)).to.eq(power)
            expect(await lingerieGirls.totalSupply()).to.eq(BigNumber.from(1))
            expect(await lingerieGirls.tokenURI(id)).to.eq(`https://api.maidcoin.org/lingeriegirls/${id}`)
        })

        it("batch mint", async () => {

            const id1 = BigNumber.from(0);
            const id2 = BigNumber.from(1);
            const power1 = BigNumber.from(12);
            const power2 = BigNumber.from(15);

            await expect(lingerieGirls.mintBatch([power1, power2], 2))
                .to.emit(lingerieGirls, "Transfer")
                .withArgs(constants.AddressZero, admin.address, id1)
                .to.emit(lingerieGirls, "Transfer")
                .withArgs(constants.AddressZero, admin.address, id2)

            expect(await lingerieGirls.powerOf(id1)).to.eq(power1)
            expect(await lingerieGirls.totalSupply()).to.eq(BigNumber.from(2))
            expect(await lingerieGirls.tokenURI(id1)).to.eq(`https://api.maidcoin.org/lingeriegirls/${id1}`)

            expect(await lingerieGirls.powerOf(id2)).to.eq(power2)
            expect(await lingerieGirls.totalSupply()).to.eq(BigNumber.from(2))
            expect(await lingerieGirls.tokenURI(id2)).to.eq(`https://api.maidcoin.org/lingeriegirls/${id2}`)
        })

        it("support, powerOf", async () => {

            const id = BigNumber.from(0);
            const power = BigNumber.from(12);
            const token = BigNumber.from(100);

            await testLPToken.mint(admin.address, token);
            await testLPToken.approve(lingerieGirls.address, token);

            await expect(lingerieGirls.mint(power))
                .to.emit(lingerieGirls, "Transfer")
                .withArgs(constants.AddressZero, admin.address, id)
            await expect(lingerieGirls.support(id, token))
                .to.emit(lingerieGirls, "Support")
                .withArgs(id, token)
            expect(await lingerieGirls.powerOf(id)).to.eq(power.add(token.mul(await lingerieGirls.lpTokenToLingerieGirlPower()).div(expandTo18Decimals(1))))
        })

        it("desupport, powerOf", async () => {

            const id = BigNumber.from(0);
            const power = BigNumber.from(12);
            const token = BigNumber.from(100);

            await testLPToken.mint(admin.address, token);
            await testLPToken.approve(lingerieGirls.address, token);

            await expect(lingerieGirls.mint(power))
                .to.emit(lingerieGirls, "Transfer")
                .withArgs(constants.AddressZero, admin.address, id)
            await expect(lingerieGirls.support(id, token))
                .to.emit(lingerieGirls, "Support")
                .withArgs(id, token)
            expect(await lingerieGirls.powerOf(id)).to.eq(power.add(token.mul(await lingerieGirls.lpTokenToLingerieGirlPower()).div(expandTo18Decimals(1))))
            await expect(lingerieGirls.desupport(id, token))
                .to.emit(lingerieGirls, "Desupport")
                .withArgs(id, token)
            expect(await lingerieGirls.powerOf(id)).to.eq(power)
        })

        it("permit", async () => {

            const id = BigNumber.from(0);

            await expect(lingerieGirls.mint(BigNumber.from(12)))
                .to.emit(lingerieGirls, "Transfer")
                .withArgs(constants.AddressZero, admin.address, id)

            const nonce = await lingerieGirls.nonces(id)
            const deadline = constants.MaxUint256
            const digest = await getERC721ApprovalDigest(
                lingerieGirls,
                { spender: other.address, id },
                nonce,
                deadline
            )

            const { v, r, s } = ecsign(Buffer.from(digest.slice(2), "hex"), Buffer.from(admin.privateKey.slice(2), "hex"))

            await expect(lingerieGirls.permit(other.address, id, deadline, v, hexlify(r), hexlify(s)))
                .to.emit(lingerieGirls, "Approval")
                .withArgs(admin.address, other.address, id)
            expect(await lingerieGirls.getApproved(id)).to.eq(other.address)
            expect(await lingerieGirls.nonces(id)).to.eq(BigNumber.from(1))
        })
    })
})
