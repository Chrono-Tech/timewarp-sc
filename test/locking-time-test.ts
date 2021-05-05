import {BigNumber} from '@ethersproject/bignumber'
import * as chai from 'chai'
import {ethers, network} from "hardhat"
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
let percent = 15
let wallet1 = null
let wallet2 = null
let wallet3 = null
let wallet4 = null
let walletStartAmount = ethToWei(200000)

describe("Time Warp Locking Time Tests", function () {

    before("Before hook", async function () {
        const arr = await ethers.getSigners()
        wallet1 = arr[0]
        wallet2 = arr[1]
        wallet3 = arr[2]

        const ERC20 = await ethers.getContractFactory("ERC20")
        erc20Deposit = await ERC20.deploy("Time Token", "TIME", 8)
        await erc20Deposit.deployed()
        await (await erc20Deposit.mint(wallet2.address, walletStartAmount)).wait()

        await (await erc20Deposit.mint(wallet3.address, walletStartAmount)).wait()

        const TimeWarpPool = await ethers.getContractFactory("TimeWarpPool")
        timeWarpPool = await TimeWarpPool.deploy()
        await erc20Deposit.deployed()

        await (await timeWarpPool.init(erc20Deposit.address, erc20Deposit.address)).wait()
        await expect(timeWarpPool.init(erc20Deposit.address, erc20Deposit.address)).to.be.revertedWith('Initialized');
        await (await erc20Deposit.approve(timeWarpPool.address, MAX_APPROVE_AMOUNT)).wait()
    })

    afterEach("After each", async function () {
        // ------ Check balance lost -------
        let rewardsAmount = new BigNumberJs(0)
        let stackingAmounts = new BigNumberJs(0)
        let balanceTimeWarp = new BigNumberJs((await erc20Deposit.balanceOf(timeWarpPool.address)).toString())
        for (let wallet of [wallet1, wallet2, wallet3]) {
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

    it("Wallet 2 Deposit and Withdraw check expiration time", async function () {
        erc20Deposit = erc20Deposit.connect(wallet2)
        await (await erc20Deposit.approve(timeWarpPool.address, MAX_APPROVE_AMOUNT)).wait()

        timeWarpPool = timeWarpPool.connect(wallet2)
        await (await timeWarpPool.deposit(LockType.DAYS180, ethToWei(1), false)).wait()
        await expect(timeWarpPool.withdraw((await timeWarpPool.userStacked(wallet2.address)).toString())).to.be.revertedWith('Expiration time of the deposit is not over');
        await network.provider.send("evm_increaseTime", [15120000]) // Increase 175 days
        await expect(timeWarpPool.withdraw((await timeWarpPool.userStacked(wallet2.address)).toString())).to.be.revertedWith('Expiration time of the deposit is not over');
        await network.provider.send("evm_increaseTime", [604800]) // Increase 7 day
        const balanceBeforeWithdraw = await erc20Deposit.balanceOf(wallet2.address)
        await (await timeWarpPool.withdraw((await timeWarpPool.userStacked(wallet2.address)).toString())).wait()
        const balanceAfterWithdraw = await erc20Deposit.balanceOf(wallet2.address)
        expect(balanceAfterWithdraw).to.equal(balanceBeforeWithdraw.add(ethToWei(1)))
    });

    it("Wallet 2 Check Again Deposit and Withdraw to lower time", async function () {
        timeWarpPool = timeWarpPool.connect(wallet2)
        expect(await timeWarpPool.userStacked(wallet2.address)).to.equal(0)
        await (await timeWarpPool.deposit(LockType.DAYS30, ethToWei(1), false)).wait()
        expect(await timeWarpPool.userStacked(wallet2.address)).to.equal(ethToWei(1))

        await expect(timeWarpPool.withdraw((await timeWarpPool.userStacked(wallet2.address)).toString())).to.be.revertedWith('Expiration time of the deposit is not over');
        await network.provider.send("evm_increaseTime", [2592000]) // Increase 30 days
        await (await timeWarpPool.withdraw((await timeWarpPool.userStacked(wallet2.address)).toString())).wait()
    });

    it("Wallet 3 Check Emergency Withdraw", async function () {
        timeWarpPool = timeWarpPool.connect(wallet3)
        erc20Deposit = erc20Deposit.connect(wallet3)

        await (await erc20Deposit.approve(timeWarpPool.address, MAX_APPROVE_AMOUNT)).wait()

        await (await timeWarpPool.deposit(LockType.DAYS180, ethToWei(1), false)).wait()
        expect(await timeWarpPool.userStacked(wallet3.address)).to.equal(ethToWei(1))

        await expect(timeWarpPool.withdraw((await timeWarpPool.userStacked(wallet3.address)).toString())).to.be.revertedWith('Expiration time of the deposit is not over');
        timeWarpPool = timeWarpPool.connect(wallet1)
        await (await timeWarpPool.setUnlockAll(true)).wait()
        timeWarpPool = timeWarpPool.connect(wallet3)
        await (await timeWarpPool.withdraw((await timeWarpPool.userStacked(wallet3.address)).toString())).wait()
    });
});
