// import { BigNumber } from "@ethersproject/bignumber";
import BigNumber from 'bignumber.js'
import * as chai from 'chai'
import {ethers} from "hardhat"
import { solidity } from "ethereum-waffle";
import {before} from "mocha";
import {
    MAX_APPROVE_AMOUNT,
    ethToWei,
    weiToEth,
    equalEth,
} from './utils/base'
import BigNumberJs from "bignumber.js";

chai.use(solidity);
chai.use(require('chai-bignumber')());

const expect = chai.expect

enum LockType { NULL, HOURS1, DAYS30, DAYS180, DAYS365, DAYS730}

let erc20Deposit = null
let timeWarpPool = null
let wallet1 = null
let wallet2 = null
let wallet3 = null
let wallet4 = null
let walletStartAmount = ethToWei(200000)

describe("Time Warp Deposit Fee Test", function () {

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
        await (await erc20Deposit.approve(timeWarpPool.address, MAX_APPROVE_AMOUNT)).wait()
    })

    afterEach("After each", async function () {
        // ------ Check balance lost -------
        let rewardsAmount = new BigNumberJs(0)
        let stackingAmounts = new BigNumberJs(0)
        let balanceTimeWarp = new BigNumberJs((await erc20Deposit.balanceOf(timeWarpPool.address)).toString())
        for (let wallet of [wallet1, wallet2, wallet3, wallet4]) {
            const stacked = (await timeWarpPool.userStacked(wallet.address)).toString()
            const rewardWithFixed = (await timeWarpPool.getReward(wallet.address, 0)).toString()
            const reward = (new BigNumberJs(rewardWithFixed.replace(',', '.'))).toFixed(0)
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

    it("Wallet 1,2 Set Zero Zee, Deposit, Reward, Harvest and checks Fee", async function () {
        timeWarpPool = timeWarpPool.connect(wallet2)
        await expect(timeWarpPool.setFee(0, 1000))
            .to.be.revertedWith('Ownable: caller is not the owner');

        timeWarpPool = timeWarpPool.connect(wallet1)
        await (await timeWarpPool.setFee(0, 1000)).wait()

        erc20Deposit = erc20Deposit.connect(wallet2)
        timeWarpPool = timeWarpPool.connect(wallet2)
        await (await erc20Deposit.approve(timeWarpPool.address, MAX_APPROVE_AMOUNT)).wait()
        await (await timeWarpPool.deposit(LockType.HOURS1, ethToWei(1), false)).wait()

        erc20Deposit = erc20Deposit.connect(wallet3)
        timeWarpPool = timeWarpPool.connect(wallet3)
        await (await erc20Deposit.approve(timeWarpPool.address, MAX_APPROVE_AMOUNT)).wait()
        await (await timeWarpPool.deposit(LockType.DAYS30, ethToWei(1), false)).wait()

        expect(await timeWarpPool.accumulatedFee()).to.be.equal(0)

        expect(await timeWarpPool.userStacked(wallet2.address)).to.be.equal(ethToWei(1))
        expect(await timeWarpPool.userStacked(wallet3.address)).to.be.equal(ethToWei(1))

        timeWarpPool = timeWarpPool.connect(wallet1)
        await (await timeWarpPool.reward(ethToWei(2.2))).wait()

        timeWarpPool = timeWarpPool.connect(wallet3)
        const {amount: amount2} = await timeWarpPool.getReward(wallet2.address, 0)
        const equal2 = equalEth(weiToEth(amount2.toString()), '1', 5)
        expect(equal2).to.be.equal(true)

        const {amount: amount3} = await timeWarpPool.getReward(wallet3.address, 0)
        const equal3 = equalEth(weiToEth(amount3.toString()), '1.2', 5)
        expect(equal3).to.be.equal(true)

        timeWarpPool = timeWarpPool.connect(wallet1)
        await (await timeWarpPool.setUnlockAll(true)).wait()
        timeWarpPool = timeWarpPool.connect(wallet2)
        await (await timeWarpPool.withdraw((await timeWarpPool.userStacked(wallet2.address)).toString())).wait()
        timeWarpPool = timeWarpPool.connect(wallet3)
        await (await timeWarpPool.withdraw((await timeWarpPool.userStacked(wallet3.address)).toString())).wait()
    });

    it("Wallet 1,2 Set 1.5% Zee, Deposit, Reward, Harvest and checks Fee", async function () {
        timeWarpPool = timeWarpPool.connect(wallet2)
        await expect(timeWarpPool.setFee(0, 1000))
            .to.be.revertedWith('Ownable: caller is not the owner');

        timeWarpPool = timeWarpPool.connect(wallet1)
        await (await timeWarpPool.setFee(15, 1000)).wait()

        erc20Deposit = erc20Deposit.connect(wallet2)
        timeWarpPool = timeWarpPool.connect(wallet2)
        await (await erc20Deposit.approve(timeWarpPool.address, MAX_APPROVE_AMOUNT)).wait()
        await (await timeWarpPool.deposit(LockType.HOURS1, ethToWei(1), false)).wait()

        erc20Deposit = erc20Deposit.connect(wallet3)
        timeWarpPool = timeWarpPool.connect(wallet3)
        await (await erc20Deposit.approve(timeWarpPool.address, MAX_APPROVE_AMOUNT)).wait()
        await (await timeWarpPool.deposit(LockType.DAYS30, ethToWei(1), false)).wait()

        expect(await timeWarpPool.accumulatedFee()).to.be.equal(ethToWei(0.03))

        expect(await timeWarpPool.userStacked(wallet2.address)).to.be.equal(ethToWei(0.985))
        expect(await timeWarpPool.userStacked(wallet3.address)).to.be.equal(ethToWei(0.985))

        timeWarpPool = timeWarpPool.connect(wallet1)
        await (await timeWarpPool.reward(ethToWei(2.2))).wait()

        timeWarpPool = timeWarpPool.connect(wallet3)
        const {amount: amount2} = await timeWarpPool.getReward(wallet2.address, 0)
        const equal2 = equalEth(weiToEth(amount2.toString()), '1.0135', 3)
        expect(equal2).to.be.equal(true)

        const {amount: amount3} = await timeWarpPool.getReward(wallet3.address, 0)
        const equal3 = equalEth(weiToEth(amount3.toString()), '1.2162', 3)
        expect(equal3).to.be.equal(true)
    });
});
