import { BigNumber as BigNumberEther } from "@ethersproject/bignumber";
import BigNumber from 'bignumber.js'

export const DECIMALS_UNITS = (decimals) => BigNumberEther.from(10).pow(decimals)
export const MAX_APPROVE_AMOUNT = BigNumberEther.from(2).pow(96).div(2).sub(1)
export const ethToWei = (amount, decimals = 18) => (new BigNumber(amount).multipliedBy(DECIMALS_UNITS(decimals).toString())).toString(10)
export const weiToEth = (amount, decimals = 18) => (new BigNumber(amount).dividedBy(DECIMALS_UNITS(decimals).toString())).toString(10)
export const equalEth = (a, b, decimalPlaces) => {
    const _a = new BigNumber(a).decimalPlaces(decimalPlaces)
    const _b = new BigNumber(b).decimalPlaces(decimalPlaces)
    return _a.isEqualTo(_b)
}
