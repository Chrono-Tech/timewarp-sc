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

enum LockType { NULL, WITHOUT, DAYS30, DAYS180, DAYS365, DAYS730}

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

    it("Reward Deposit => Reward 99 Repeat => Deposit with increase lock", async function () {
        erc20Deposit = erc20Deposit.connect(wallet2)
        timeWarpPool = timeWarpPool.connect(wallet2)
        await (await erc20Deposit.approve(timeWarpPool.address, MAX_APPROVE_AMOUNT)).wait()
        await(await timeWarpPool.deposit(LockType.DAYS180, ethToWei(1.467545), false)).wait()

        timeWarpPool = timeWarpPool.connect(wallet1)
        erc20Deposit = erc20Deposit.connect(wallet1)
        await (await erc20Deposit.approve(timeWarpPool.address, MAX_APPROVE_AMOUNT)).wait()
        for (let i = 0; i < 99; i++) {
            await (await timeWarpPool.reward(ethToWei(1.14563))).wait()
        }

        timeWarpPool = timeWarpPool.connect(wallet2)
        const receipt = await timeWarpPool.deposit(LockType.DAYS365, ethToWei(1.33446), false)
        const tx = await receipt.wait()
        console.log('tx.gasUsed', tx.gasUsed.toString())
    })
});
