import {BigNumber} from '@ethersproject/bignumber'
import * as chai from 'chai'
import {ethers} from "hardhat"
import {solidity} from "ethereum-waffle";
import {before} from "mocha";
import {
    MAX_APPROVE_AMOUNT,
    ethToWei,
} from './utils/base'
import BigNumberJs from "bignumber.js";

chai.use(solidity);

const expect = chai.expect

enum LockType { NULL, HOURS1, DAYS30, DAYS180, DAYS365, DAYS730}

let erc20Deposit = null
let timeWarpPool = null
let wallet1 = null
let wallet2 = null
let wallet3 = null
let wallet4 = null
let walletStartAmount = ethToWei(20000000)

describe("Time Warp Rewards And Many Harvests Test", function () {

    before("Before hook", async function () {
        const arr = await ethers.getSigners()
        wallet1 = arr[0]
        wallet2 = arr[1]
        wallet3 = arr[2]
        wallet4 = arr[3]

        const ERC20 = await ethers.getContractFactory("ERC20")
        erc20Deposit = await ERC20.deploy("Time Token", "TIME", 8)
        await erc20Deposit.deployed()
        await (await erc20Deposit.mint(wallet1.address, walletStartAmount)).wait()

        await (await erc20Deposit.mint(wallet2.address, walletStartAmount)).wait()

        await (await erc20Deposit.mint(wallet3.address, walletStartAmount)).wait()

        await (await erc20Deposit.mint(wallet4.address, walletStartAmount)).wait()

        const TimeWarpPool = await ethers.getContractFactory("TimeWarpPool")
        timeWarpPool = await TimeWarpPool.deploy()
        await erc20Deposit.deployed()

        await (await timeWarpPool.init(erc20Deposit.address, erc20Deposit.address)).wait()
        await (await timeWarpPool.setUnlockAll(true)).wait()
        await (await erc20Deposit.approve(timeWarpPool.address, MAX_APPROVE_AMOUNT)).wait()
    })

    afterEach("After each", async function () {
        // ------ Check balance lost -------
        let rewardsAmount = new BigNumberJs(0)
        let stackingAmounts = new BigNumberJs(0)
        let balanceTimeWarp = new BigNumberJs((await erc20Deposit.balanceOf(timeWarpPool.address)).toString())
        for (let wallet of [wallet1, wallet2, wallet3, wallet4]) {
            const stacked = (await timeWarpPool.userStacked(wallet.address)).toString()
            const { amount: amountReward } = await timeWarpPool.getReward(wallet.address, 0)
            const reward = (new BigNumberJs(amountReward.toString())).toFixed(0)
            stackingAmounts = stackingAmounts.plus(stacked)
            rewardsAmount = rewardsAmount.plus(reward)
        }
        if (balanceTimeWarp.isLessThan(stackingAmounts.plus(rewardsAmount))) {
            console.error('!!!!!!!^^^^^^ Has balance loss !!!!!!!^^^^^^')
            console.log('Rewards Amount ', rewardsAmount.toFixed(0))
            console.log('Stacking Amounts ', stackingAmounts.toFixed(0))
            console.log('Balance TimeWarp Pool = ', (await erc20Deposit.balanceOf(timeWarpPool.address)).toString())
            expect(balanceTimeWarp.isGreaterThanOrEqualTo(stackingAmounts.plus(rewardsAmount))).to.equal(true)
        }
        // ------ End Check balance lost -------
    })

    it("Wallet 2 Deposit", async function () {
        erc20Deposit = erc20Deposit.connect(wallet2)
        await (await erc20Deposit.approve(timeWarpPool.address, MAX_APPROVE_AMOUNT)).wait()

        timeWarpPool = timeWarpPool.connect(wallet2)
        await(await timeWarpPool.deposit(LockType.HOURS1, ethToWei(1), false)).wait()
    });

    it("Reward Repeat 100", async function () {
        timeWarpPool = timeWarpPool.connect(wallet1)
        for (let i = 0; i < 100; i++) {
            await (await timeWarpPool.reward(ethToWei(1))).wait()
        }
    })

    it("Wallet 2 Get Reward and Harvest", async function () {
        timeWarpPool = timeWarpPool.connect(wallet2)
        const {amount: amount_, lastRewardIndex: lastRewardIndex_} = await timeWarpPool.getReward(wallet2.address, 0)
        expect(amount_).to.equal(ethToWei(100))
        expect(lastRewardIndex_).to.equal(100)

        const balanceBeforeHarvest = await erc20Deposit.balanceOf(wallet2.address)
        const receipt = await timeWarpPool.harvest()
        await receipt.wait()
        await expect(receipt)
            .to.emit(timeWarpPool, 'Harvest')
            .withArgs(LockType.HOURS1, ethToWei(100), 100);
        const balanceAfterHarvest = await erc20Deposit.balanceOf(wallet2.address)
        const {amount, lastRewardIndex} = await timeWarpPool.getReward(wallet2.address, 0)
        expect(amount).to.equal(0)
        expect(lastRewardIndex).to.equal(100)
        expect(balanceAfterHarvest).to.equal(BigNumber.from(balanceBeforeHarvest).add(ethToWei(100)))
    })

    it("Reward Repeat 100", async function () {
        timeWarpPool = timeWarpPool.connect(wallet1)
        for (let i = 0; i < 100; i++) {
            await (await timeWarpPool.reward(ethToWei(1))).wait()
        }
    })

    it("Wallet 2 Second Harvest", async function () {
        timeWarpPool = timeWarpPool.connect(wallet2)
        const balanceBeforeHarvest = await erc20Deposit.balanceOf(wallet2.address)
        const receipt = await timeWarpPool.harvest()
        await receipt.wait()
        const balanceAfterHarvest = await erc20Deposit.balanceOf(wallet2.address)
        const userLastReward = await timeWarpPool.userLastReward(wallet2.address)
        await expect(receipt)
            .to.emit(timeWarpPool, 'Harvest')
            .withArgs(LockType.HOURS1, ethToWei(100), userLastReward);
        expect(userLastReward).to.equal(200)
        expect(balanceAfterHarvest).to.equal(BigNumber.from(balanceBeforeHarvest).add(ethToWei(100)))
    })

    it("Reward Repeat 103", async function () {
        timeWarpPool = timeWarpPool.connect(wallet1)
        for (let i = 0; i < 203; i++) {
            await (await timeWarpPool.reward(ethToWei(1))).wait()
        }
    })

    it("Wallet 2 Check Revert 'We cannot get reward in one transaction'", async function () {
        timeWarpPool = timeWarpPool.connect(wallet2)
        await expect(timeWarpPool.withdraw((await timeWarpPool.userStacked(wallet2.address)).toString()))
            .to.be.revertedWith('We cannot get reward in one transaction');
        await expect(timeWarpPool.deposit(LockType.HOURS1, ethToWei(1), true))
            .to.be.revertedWith('We cannot get reward in one transaction');
    })

    it("Wallet 2 Three Harvest Transactions", async function () {
        timeWarpPool = timeWarpPool.connect(wallet2)

        const balanceBeforeHarvest1 = await erc20Deposit.balanceOf(wallet2.address)
        const receipt1 = await timeWarpPool.harvest()
        await receipt1.wait()
        const balanceAfterHarvest1 = await erc20Deposit.balanceOf(wallet2.address)
        const userLastReward1 = await timeWarpPool.userLastReward(wallet2.address)
        await expect(receipt1)
            .to.emit(timeWarpPool, 'Harvest')
            .withArgs(LockType.HOURS1, ethToWei(100), userLastReward1);
        expect(balanceAfterHarvest1).to.equal(BigNumber.from(balanceBeforeHarvest1).add(ethToWei(100)))

        const balanceBeforeHarvest2 = await erc20Deposit.balanceOf(wallet2.address)
        const receipt2 = await timeWarpPool.harvest()
        await receipt2.wait()
        const balanceAfterHarvest2 = await erc20Deposit.balanceOf(wallet2.address)
        const userLastReward2 = await timeWarpPool.userLastReward(wallet2.address)
        // expect(await timeWarpPool.hasHarvest(wallet2.address)).to.equal(true)
        await expect(receipt2)
            .to.emit(timeWarpPool, 'Harvest')
            .withArgs(LockType.HOURS1, ethToWei(100), userLastReward2);
        expect(balanceAfterHarvest2).to.equal(BigNumber.from(balanceBeforeHarvest2).add(ethToWei(100)))

        const balanceBeforeHarvest3 = await erc20Deposit.balanceOf(wallet2.address)
        const receipt3 = await timeWarpPool.harvest()
        await receipt3.wait()
        const balanceAfterHarvest3 = await erc20Deposit.balanceOf(wallet2.address)
        const userLastReward3 = await timeWarpPool.userLastReward(wallet2.address)
        // expect(await timeWarpPool.hasHarvest(wallet2.address)).to.equal(false)
        await expect(receipt3)
            .to.emit(timeWarpPool, 'Harvest')
            .withArgs(LockType.HOURS1, ethToWei(3), userLastReward3);
        expect(balanceAfterHarvest3).to.equal(BigNumber.from(balanceBeforeHarvest3).add(ethToWei(3)))

        await expect(timeWarpPool.harvest())
            .to.be.revertedWith('You have no accumulated reward');
    })
});
