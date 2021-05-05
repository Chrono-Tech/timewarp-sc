import {BigNumber} from '@ethersproject/bignumber'
import BigNumberJs from 'bignumber.js'
import * as chai from 'chai'
import {ethers} from "hardhat"
import {solidity} from "ethereum-waffle";
import {before} from "mocha";
import {
    MAX_APPROVE_AMOUNT,
    ethToWei, equalEth, weiToEth,
} from './utils/base'

chai.use(solidity);

const expect = chai.expect

enum LockType { NULL, WITHOUT, DAYS30, DAYS180, DAYS365, DAYS730}

const erc20DepositDecimals = 8
let erc20Deposit = null
let timeWarpPool = null
let wallet1 = null
let wallet2 = null
let wallet3 = null
let wallet4 = null
let wallet5 = null
let walletStartAmount = ethToWei(200)

describe("Time Warp Base Tests", function () {

    afterEach("After each", async function () {
        // let printedRewardWallets = []
        // for (let item in LockType) {
        //     let printed = false
        //     if (isNaN(Number(item))) {
        //         if (item !== 'NULL') {
        //             const totalStacked = await timeWarpPool.totalStacked(LockType[item])
        //             if (totalStacked != 0) {
        //                 console.log(`Total Stacked for ${item}`, totalStacked.toString())
        //                 printed = true
        //             }
        //             if (totalStacked != 0) {
        //                 console.log(`Total Stacked for ${item}`, totalStacked.toString())
        //                 printed = true
        //             }
        //             for (let wallet of [wallet1, wallet2, wallet3, wallet4, wallet5]) {
        //                 const balance = await timeWarpPool.userStacked(wallet.address)
        //                 if (balance != 0) {
        //                     console.log(`Balance Stacking ${item}, user ${wallet.address} ${balance}`)
        //                     printed = true
        //                 }
        //
        //                 if (!printedRewardWallets.includes(wallet.address)) {
        //                     const {amount} = await timeWarpPool.getReward(wallet.address, 0)
        //                     if (amount != 0) {
        //                         console.log(`Reward user ${wallet.address} ${amount}`)
        //                         printed = true
        //                         printedRewardWallets.push(wallet.address)
        //                     }
        //                 }
        //
        //             }
        //             if (printed) {
        //                 console.log('--------------------------------------')
        //             }
        //         }
        //     }
        // }
        // console.log('Balance TimeWarp Pool = ', (await erc20Deposit.balanceOf(timeWarpPool.address)).toString())

        // ------ Check balance lost -------
        let rewardsAmount = new BigNumberJs(0)
        let stackingAmounts = new BigNumberJs(0)
        let balanceTimeWarp = new BigNumberJs((await erc20Deposit.balanceOf(timeWarpPool.address)).toString())
        for (let wallet of [wallet1, wallet2, wallet3, wallet4, wallet5]) {
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

    before("Before hook", async function () {
        const arr = await ethers.getSigners()
        wallet1 = arr[0]
        wallet2 = arr[1]
        wallet3 = arr[2]
        wallet4 = arr[3]
        wallet5 = arr[4]

        const ERC20 = await ethers.getContractFactory("ERC20")
        erc20Deposit = await ERC20.deploy("Time Token", "TIME", erc20DepositDecimals)
        // console.log('erc20Deposit', erc20Deposit)
        const dep = await erc20Deposit.deployed()
        console.log('dep', (await dep.deployTransaction.wait()).gasUsed.toString())
        await (await erc20Deposit.mint(wallet1.address, walletStartAmount)).wait()
        await (await erc20Deposit.mint(wallet2.address, walletStartAmount)).wait()
        await (await erc20Deposit.mint(wallet3.address, walletStartAmount)).wait()
        await (await erc20Deposit.mint(wallet4.address, walletStartAmount)).wait()
        await (await erc20Deposit.mint(wallet5.address, walletStartAmount)).wait()

        const TimeWarpPool = await ethers.getContractFactory("TimeWarpPool")
        timeWarpPool = await TimeWarpPool.deploy()
        await erc20Deposit.deployed()

        await (await timeWarpPool.init(erc20Deposit.address, erc20Deposit.address)).wait()
        await (await timeWarpPool.setUnlockAll(true)).wait()
        await (await timeWarpPool.setFee(15, 1000)).wait()
        await (await erc20Deposit.approve(timeWarpPool.address, MAX_APPROVE_AMOUNT)).wait()
    })

    it("Wallet 2,3 Make Deposits", async function () {
        erc20Deposit = erc20Deposit.connect(wallet2)
        timeWarpPool = timeWarpPool.connect(wallet2)
        await (await erc20Deposit.approve(timeWarpPool.address, MAX_APPROVE_AMOUNT)).wait()
        await (await timeWarpPool.deposit(LockType.WITHOUT, ethToWei(1, erc20DepositDecimals), false)).wait()

        erc20Deposit = erc20Deposit.connect(wallet3)
        timeWarpPool = timeWarpPool.connect(wallet3)
        await (await erc20Deposit.approve(timeWarpPool.address, MAX_APPROVE_AMOUNT)).wait()
        await (await timeWarpPool.deposit(LockType.DAYS30, ethToWei(1, erc20DepositDecimals), false)).wait()
    });

    it("Reward", async function () {
        timeWarpPool = timeWarpPool.connect(wallet1)
        await (await timeWarpPool.reward(ethToWei(10, erc20DepositDecimals))).wait()
    })

    it("Wallet 4 Deposit after Reward and check uncharged Reward", async function () {
        erc20Deposit = erc20Deposit.connect(wallet4)
        await (await erc20Deposit.approve(timeWarpPool.address, MAX_APPROVE_AMOUNT)).wait()

        timeWarpPool = timeWarpPool.connect(wallet4)
        await (await timeWarpPool.deposit(LockType.DAYS180, ethToWei(2, erc20DepositDecimals), false)).wait()

        const {amount: rewardAmount} = await timeWarpPool.getReward(wallet4.address, 0)
        await expect(rewardAmount).to.be.equal(0);
    });

    it("Wallet 4 Deposit decrease lock period revert", async function () {
        timeWarpPool = timeWarpPool.connect(wallet4)
        await expect(timeWarpPool.deposit(LockType.DAYS30, ethToWei(2, erc20DepositDecimals), false))
            .to.be.revertedWith('You cannot decrease the time of locking');
    });


    it("Check Distributed Rewards", async function () {
        // const { _amount,  } = await timeWarpPool.getReward(wallet4.address)
        // console.log('Wallet 4 Reward ', _amount.toString())
        // expect(_amount).to.equal(ethToWei(5))
    })

    it("Wallet 3 Harvest check", async function () {
        timeWarpPool = timeWarpPool.connect(wallet3)
        const {amount: rewardAmountBeforeHarvest} = await timeWarpPool.getReward(wallet3.address, 0)
        const balanceDepositTokensBeforeHarvest = await erc20Deposit.balanceOf(wallet3.address)
        await (await timeWarpPool.harvest()).wait()
        const {amount: rewardAmountAfterHarvest} = await timeWarpPool.getReward(wallet3.address, 0)
        const balanceDepositTokensAfterHarvest = await erc20Deposit.balanceOf(wallet3.address)
        expect(balanceDepositTokensAfterHarvest).to.equal(rewardAmountBeforeHarvest.add(balanceDepositTokensBeforeHarvest))
        expect(rewardAmountAfterHarvest).to.equal(0)
        await expect(timeWarpPool.harvest()).to.be.revertedWith('You have no accumulated reward');
    })

    it("Wallet 2 Compound check", async function () {
        timeWarpPool = timeWarpPool.connect(wallet2)
        const {amount: rewardAmountBeforeCompound} = await timeWarpPool.getReward(wallet2.address, 0)
        const stackedAmountBeforeCompound = await timeWarpPool.userStacked(wallet2.address)
        const balanceDepositTokensBeforeCompound = await erc20Deposit.balanceOf(wallet2.address)
        await (await timeWarpPool.compound()).wait()
        const {amount: rewardAmountAfterCompound} = await timeWarpPool.getReward(wallet2.address, 0)
        const balanceDepositTokensAfterCompound = await erc20Deposit.balanceOf(wallet2.address)
        const stackedAmountAfterCompound = await timeWarpPool.userStacked(wallet2.address)
        expect(stackedAmountAfterCompound).to.equal(stackedAmountBeforeCompound.add(rewardAmountBeforeCompound))
        expect(balanceDepositTokensBeforeCompound).to.equal(balanceDepositTokensAfterCompound)
        expect(rewardAmountAfterCompound).to.equal(0)
        await expect(timeWarpPool.compound()).to.be.revertedWith('You have no accumulated reward');
    })


    it("Wallet 2 Withdraw and Get Reward check", async function () {
        timeWarpPool = timeWarpPool.connect(wallet2)
        const stackedAmountBeforeWithdraw = await timeWarpPool.userStacked(wallet2.address)
        const balanceDepositTokensBeforeWithdraw = await erc20Deposit.balanceOf(wallet2.address)
        await (await timeWarpPool.withdraw((await timeWarpPool.userStacked(wallet2.address)).toString())).wait()
        const {amount: rewardAmountAfterWithdraw} = await timeWarpPool.getReward(wallet2.address, 0)
        const balanceDepositTokensAfterWithdraw = await erc20Deposit.balanceOf(wallet2.address)
        expect(rewardAmountAfterWithdraw).to.equal(0)
        expect(balanceDepositTokensAfterWithdraw).to.equal(balanceDepositTokensBeforeWithdraw.add(stackedAmountBeforeWithdraw))
    })

    it("Reward Again", async function () {
        timeWarpPool = timeWarpPool.connect(wallet1)
        await (await timeWarpPool.reward(ethToWei(2, erc20DepositDecimals))).wait()
        await (await timeWarpPool.reward(ethToWei(3, erc20DepositDecimals))).wait()
    })

    it("Withdraw After Reward for Wallet 3", async function () {
        timeWarpPool = timeWarpPool.connect(wallet3)
        const stackedAmountBeforeWithdraw = await timeWarpPool.userStacked(wallet3.address)
        const balanceDepositTokensBeforeWithdraw = await erc20Deposit.balanceOf(wallet3.address)
        const {amount: rewardAmountBeforeWithdraw} = await timeWarpPool.getReward(wallet3.address, 0)
        await (await timeWarpPool.withdraw((await timeWarpPool.userStacked(wallet3.address)).toString())).wait()
        const stackedAmountAfterWithdraw = await timeWarpPool.userStacked(wallet3.address)
        const {amount: rewardAmountAfterWithdraw} = await timeWarpPool.getReward(wallet3.address, 0)
        const balanceDepositTokensAfterWithdraw = await erc20Deposit.balanceOf(wallet3.address)
        expect(stackedAmountAfterWithdraw).to.equal(0)
        expect(rewardAmountAfterWithdraw).to.equal(0)
        expect(balanceDepositTokensAfterWithdraw).to.equal(balanceDepositTokensBeforeWithdraw.add(stackedAmountBeforeWithdraw).add(rewardAmountBeforeWithdraw))
    })

    it("Wallet 3 Deposit with decrease lock period after Withdraw", async function () {
        timeWarpPool = timeWarpPool.connect(wallet3)
        await (await timeWarpPool.deposit(LockType.DAYS30, ethToWei(1, erc20DepositDecimals), false)).wait()
        await (await timeWarpPool.withdraw((await timeWarpPool.userStacked(wallet3.address)).toString())).wait()
        await (await timeWarpPool.deposit(LockType.WITHOUT, ethToWei(1, erc20DepositDecimals), false)).wait()
    })

    it("Wallet 5 Deposit with increase locks, checks correct Harvest and Compound", async function () {
        timeWarpPool = timeWarpPool.connect(wallet4)
        await (await timeWarpPool.withdraw((await timeWarpPool.userStacked(wallet4.address)).toString())).wait()
        timeWarpPool = timeWarpPool.connect(wallet3)
        await (await timeWarpPool.withdraw((await timeWarpPool.userStacked(wallet3.address)).toString())).wait()

        erc20Deposit = erc20Deposit.connect(wallet5)
        timeWarpPool = timeWarpPool.connect(wallet5)
        await (await erc20Deposit.approve(timeWarpPool.address, MAX_APPROVE_AMOUNT)).wait()
        await (await timeWarpPool.deposit(LockType.DAYS30, ethToWei(1, erc20DepositDecimals), false)).wait()

        const accumulatedFeeBeforeReward = await timeWarpPool.accumulatedFee()

        erc20Deposit = erc20Deposit.connect(wallet1)
        timeWarpPool = timeWarpPool.connect(wallet1)
        await (await erc20Deposit.approve(timeWarpPool.address, MAX_APPROVE_AMOUNT)).wait()
        await (await timeWarpPool.reward(ethToWei(4, erc20DepositDecimals))).wait()

        const balanceBeforeIncrease = await erc20Deposit.balanceOf(wallet5.address)
        erc20Deposit = erc20Deposit.connect(wallet5)
        timeWarpPool = timeWarpPool.connect(wallet5)
        await (await erc20Deposit.approve(timeWarpPool.address, MAX_APPROVE_AMOUNT)).wait()
        await (await timeWarpPool.deposit(LockType.DAYS30, ethToWei(1, erc20DepositDecimals), false)).wait()
        const balanceAfterIncrease = await erc20Deposit.balanceOf(wallet5.address)
        const balanceDiff = balanceAfterIncrease.sub(balanceBeforeIncrease)

        const expectAmount = new BigNumberJs(3).plus(weiToEth(accumulatedFeeBeforeReward.toString(), erc20DepositDecimals))
        const equal = equalEth(
            weiToEth(balanceDiff.toString(), erc20DepositDecimals),
            expectAmount.toString(),
            3
        )
        expect(equal).to.be.equal(true)
    })

    it("Wallet 3 Withdraw partial", async function () {
        timeWarpPool = timeWarpPool.connect(wallet3)
        await (await timeWarpPool.deposit(LockType.DAYS30, ethToWei(1, erc20DepositDecimals), false)).wait()
        await (await timeWarpPool.withdraw(ethToWei(0.5, erc20DepositDecimals))).wait()
        const stacked = await timeWarpPool.userStacked(wallet3.address)
        await expect(stacked.toString()).to.equal(ethToWei(0.485, erc20DepositDecimals))
    })
});
