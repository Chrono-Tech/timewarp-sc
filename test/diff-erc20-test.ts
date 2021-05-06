import {BigNumber} from '@ethersproject/bignumber'
import * as chai from 'chai'
import {ethers} from "hardhat"
import {solidity} from "ethereum-waffle";
import {before} from "mocha";
import {
    MAX_APPROVE_AMOUNT,
    ethToWei, equalEth, weiToEth,
} from './utils/base'
import BigNumberJs from "bignumber.js";

chai.use(solidity);

const expect = chai.expect

enum LockType { NULL, HOURS1, DAYS30, DAYS180, DAYS365, DAYS730}

let erc20Deposit = null
let erc20Reward = null
let timeWarpPool = null
let wallet1 = null
let wallet2 = null
let wallet3 = null
let wallet4 = null
let walletStartAmount = ethToWei(20000000)

describe("Time Warp Different Deposit and Reward ERC20 Test", function () {

    before("Before hook", async function () {
        const arr = await ethers.getSigners()
        wallet1 = arr[0]
        wallet2 = arr[1]
        wallet3 = arr[2]
        wallet4 = arr[3]

        const ERC20 = await ethers.getContractFactory("ERC20")
        erc20Deposit = await ERC20.deploy("Time Token", "TIME", 8)
        await erc20Deposit.deployed()
        await (await erc20Deposit.mint(wallet2.address, walletStartAmount)).wait()
        await (await erc20Deposit.mint(wallet3.address, walletStartAmount)).wait()
        await (await erc20Deposit.mint(wallet4.address, walletStartAmount)).wait()

        erc20Reward = await ERC20.deploy("LP pool tokens USDT/TIME", "LP-USDT-TIME", 18)
        await erc20Reward.deployed()
        await (await erc20Reward.mint(wallet1.address, walletStartAmount)).wait()

        const TimeWarpPool = await ethers.getContractFactory("TimeWarpPool")
        timeWarpPool = await TimeWarpPool.deploy()
        await erc20Deposit.deployed()

        await (await timeWarpPool.init(erc20Deposit.address, erc20Reward.address)).wait()
    })

    afterEach("After each", async function () {
        // ------ Check balance lost -------
        let rewardsAmounts = new BigNumberJs(0)
        let stackingAmounts = new BigNumberJs(0)
        let balanceErc20Deposit = new BigNumberJs((await erc20Deposit.balanceOf(timeWarpPool.address)).toString())
        let balanceErc20Reward = new BigNumberJs((await erc20Reward.balanceOf(timeWarpPool.address)).toString())
        for (let wallet of [wallet1, wallet2, wallet3, wallet4]) {
            const stacked = (await timeWarpPool.userStacked(wallet.address)).toString()
            const { amount: amountReward } = await timeWarpPool.getReward(wallet.address, 0)
            const reward = (new BigNumberJs(amountReward)).toFixed(0)
            stackingAmounts = stackingAmounts.plus(stacked)
            rewardsAmounts = rewardsAmounts.plus(reward)
        }
        if (balanceErc20Deposit.isLessThan(stackingAmounts) || balanceErc20Reward.isLessThan(rewardsAmounts)) {
            console.error('!!!!!!!^^^^^^ Has balance loss !!!!!!!^^^^^^')
            console.log('Rewards Amounts ', rewardsAmounts.toFixed(0))
            console.log('Deposit Amounts ', stackingAmounts.toFixed(0))
            console.log('Balance ERC20 Deposit = ', (await erc20Deposit.balanceOf(timeWarpPool.address)).toString())
            console.log('Balance ERC20 Reward = ', (await erc20Reward.balanceOf(timeWarpPool.address)).toString())
            expect(balanceErc20Deposit.isGreaterThanOrEqualTo(stackingAmounts)).to.equal(true)
            expect(balanceErc20Reward.isGreaterThanOrEqualTo(rewardsAmounts)).to.equal(true)
        }
        // ------ End Check balance lost -------
    })

    it("Wallet 2,3 Make Deposits", async function () {
        erc20Deposit = erc20Deposit.connect(wallet2)
        timeWarpPool = timeWarpPool.connect(wallet2)
        await (await erc20Deposit.approve(timeWarpPool.address, MAX_APPROVE_AMOUNT)).wait()
        await (await timeWarpPool.deposit(LockType.HOURS1, ethToWei(1), false)).wait()

        erc20Deposit = erc20Deposit.connect(wallet3)
        timeWarpPool = timeWarpPool.connect(wallet3)
        await (await erc20Deposit.approve(timeWarpPool.address, MAX_APPROVE_AMOUNT)).wait()
        await (await timeWarpPool.deposit(LockType.DAYS30, ethToWei(1), false)).wait()
    });

    it("Pay rewards", async function () {
        erc20Reward = erc20Reward.connect(wallet1)
        timeWarpPool = timeWarpPool.connect(wallet1)
        await expect(timeWarpPool.reward(ethToWei(1))).to.be.revertedWith('Not enough allowance');
        await (await erc20Reward.approve(timeWarpPool.address, MAX_APPROVE_AMOUNT)).wait()
        await (await timeWarpPool.reward(ethToWei(2.2))).wait()

        const {amount: amount2} = await timeWarpPool.getReward(wallet2.address, 0)
        const equal2 = equalEth(weiToEth(amount2.toString()), '1', 5)
        expect(equal2).to.be.equal(true)

        const {amount: amount3} = await timeWarpPool.getReward(wallet3.address, 0)
        const equal3 = equalEth(weiToEth(amount3.toString()), '1.2', 5)
        expect(equal3).to.be.equal(true)
    })

    it("Checks prevent compound", async function () {
        timeWarpPool = timeWarpPool.connect(wallet2)
        await expect(timeWarpPool.compound()).to.be.revertedWith('Method not available');
    })

    it("Wallet 2 Make Deposit and check correct Harvest", async function () {
        const balanceDepositBefore = await erc20Deposit.balanceOf(wallet2.address)
        const balanceRewardBefore = await erc20Reward.balanceOf(wallet2.address)
        timeWarpPool = timeWarpPool.connect(wallet2)
        await (await timeWarpPool.deposit(LockType.HOURS1, ethToWei(1), true)).wait()
        const balanceDepositAfter = await erc20Deposit.balanceOf(wallet2.address)
        const balanceRewardAfter = await erc20Reward.balanceOf(wallet2.address)

        const balanceRewardDiff = balanceRewardAfter.sub(balanceRewardBefore)
        const equal1 = equalEth(weiToEth(balanceRewardDiff.toString()), '1', 5)
        expect(equal1).to.be.equal(true)

        const balanceDepositDiff = balanceDepositBefore.sub(balanceDepositAfter)
        const equal2 = equalEth(weiToEth(balanceDepositDiff.toString()), '1', 5)
        expect(equal2).to.be.equal(true)
    })

    it("Wallet 3 Make Harvest", async function () {
        const balanceRewardBefore = await erc20Reward.balanceOf(wallet3.address)
        timeWarpPool = timeWarpPool.connect(wallet3)
        await (await timeWarpPool.harvest()).wait()
        const balanceRewardAfter = await erc20Reward.balanceOf(wallet3.address)

        const balanceRewardDiff = balanceRewardAfter.sub(balanceRewardBefore)
        const equal1 = equalEth(weiToEth(balanceRewardDiff.toString()), '1.2', 5)
        expect(equal1).to.be.equal(true)
    })

    it('Wallet 4 Make Deposit, Reward, Withdraw and check harvest ', async function () {
        erc20Deposit = erc20Deposit.connect(wallet4)
        timeWarpPool = timeWarpPool.connect(wallet4)
        await (await erc20Deposit.approve(timeWarpPool.address, MAX_APPROVE_AMOUNT)).wait()
        await (await timeWarpPool.deposit(LockType.DAYS30, ethToWei(1), false)).wait()

        timeWarpPool = timeWarpPool.connect(wallet1)
        await (await timeWarpPool.setUnlockAll(true)).wait()
        await (await timeWarpPool.reward(ethToWei(4.4))).wait()

        const {amount: amount4} = await timeWarpPool.getReward(wallet4.address, 0)
        const equal4 = equalEth(weiToEth(amount4.toString()), '1.2', 5)
        expect(equal4).to.be.equal(true)

        const balanceDepositBefore = await erc20Deposit.balanceOf(wallet4.address)
        const balanceRewardBefore = await erc20Reward.balanceOf(wallet4.address)
        timeWarpPool = timeWarpPool.connect(wallet4)
        await (await timeWarpPool.withdraw((await timeWarpPool.userStacked(wallet4.address)).toString())).wait()
        const balanceDepositAfter = await erc20Deposit.balanceOf(wallet4.address)
        const balanceRewardAfter = await erc20Reward.balanceOf(wallet4.address)

        const balanceDepositDiff = balanceDepositAfter.sub(balanceDepositBefore)
        const equal1 = equalEth(weiToEth(balanceDepositDiff.toString()), '1', 5)
        expect(equal1).to.be.equal(true)

        const balanceRewardDiff = balanceRewardAfter.sub(balanceRewardBefore)
        const equal2 = equalEth(weiToEth(balanceRewardDiff.toString()), '1.2', 5)
        expect(equal2).to.be.equal(true)
    });

});
