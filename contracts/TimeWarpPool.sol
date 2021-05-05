// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

//import "hardhat/console.sol";
import "./access/Ownable.sol";
import "./interfaces/IERC20.sol";
import "./utils/token/SafeERC20.sol";
import "./utils/math/SafeMath.sol";
import "./StakingLocks.sol";

contract TimeWarpPool is Ownable, StakingLocks {
    event Deposit(LockType _lockType, uint256 _amount, uint256 _amountStacked);
    event Withdraw(uint256 _amount);
    event Harvest(LockType _lockType, uint256 _amount, uint32 _lastRewardIndex);
    event Compound(LockType _lockType, uint256 _amount, uint32 _lastRewardIndex);
    event RewardPay(uint256 _amount, uint256 _accumulatedFee);

    using SafeERC20 for IERC20;
    using SafeMath for uint;
    IERC20 public erc20Deposit;
    IERC20 public erc20Reward;
    bool private initialized;
    bool private unlockAll;
    uint256 public accumulatedFee;
    uint256 public feePercent = 0;
    uint256 public feePrecision = 1000;
    uint8 public constant MAX_LOOPS = 100;
    uint256 public constant PRECISION = 100000000;
    uint32 public lastReward;

    struct Reward {
        uint256 amount;
        uint256 totalStacked;
    }

    // -------------- New --------------
    mapping(address => LockType) public userLock;
    mapping(address => uint256) public userStacked;
    mapping(address => uint256) public expirationDeposit;
    mapping(address => uint32) public userLastReward;
    mapping(LockType => uint256) public totalStacked;
    mapping(LockType => mapping(uint32 => Reward)) public rewards;

    function init(address _erc20Deposit, address _erc20Reward) external onlyOwner {
        require(!initialized, "Initialized");
        erc20Deposit = IERC20(_erc20Deposit);
        erc20Reward = IERC20(_erc20Reward);
        _initLocks();
        initialized = true;
    }

    function setUnlockAll(bool _flag) external onlyOwner {
        unlockAll = _flag;
    }

    function setFee(uint256 _feePercent, uint256 _feePrecision) external onlyOwner {
        feePercent = _feePercent;
        feePrecision = _feePrecision;
    }

    function deposit(LockType _lockType, uint256 _amount, bool _comp) external {
        require(_amount > 0, "The amount of the deposit must not be zero");
        require(erc20Deposit.allowance(_msgSender(), address(this)) >= _amount, "Not enough allowance");
        LockType lastLock = userLock[_msgSender()];
        require(lastLock == LockType.NULL || _lockType >= lastLock, "You cannot decrease the time of locking");
        uint256 amountStacked;
        if (address(erc20Deposit) == address(erc20Reward)) {
            uint256 part = feePercent.mul(_amount).div(feePrecision);
            amountStacked = _amount - part;
            accumulatedFee = accumulatedFee + part;
        } else {
            amountStacked = _amount;
        }

        erc20Deposit.safeTransferFrom(_msgSender(), address(this), _amount);
        if (_lockType >= lastLock) {
            (uint256 amountReward, uint32 lastRewardIndex) = getReward(_msgSender(), 0);
            require(lastRewardIndex == lastReward, "We cannot get reward in one transaction");
            if (amountReward > 0) {
                if (_comp && address(erc20Deposit) == address(erc20Reward)) {
                    _compound(lastLock, amountReward, lastRewardIndex);
                } else {
                    _harvest(lastLock, amountReward, lastRewardIndex);
                }
            }
        }
        userLock[_msgSender()] = _lockType;
        if (lastLock == LockType.NULL || _lockType == lastLock) {
            // If we deposit to current stacking period, or make first deposit
            userStacked[_msgSender()] = userStacked[_msgSender()].add(amountStacked);
            totalStacked[_lockType] = totalStacked[_lockType].add(amountStacked);
        } else if (_lockType > lastLock) {
            // If we increase stacking period
            totalStacked[lastLock] = totalStacked[lastLock].sub(userStacked[_msgSender()]);
            userStacked[_msgSender()] = userStacked[_msgSender()].add(amountStacked);
            totalStacked[_lockType] = totalStacked[_lockType].add(userStacked[_msgSender()]);
        }
        userLastReward[_msgSender()] = lastReward;
        if (lastLock == LockType.NULL || _lockType > lastLock) {
            // If we have first deposit, or increase lock time
            expirationDeposit[_msgSender()] = block.timestamp + locks[_lockType].period;
        }
        emit Deposit(_lockType, _amount, amountStacked);
    }

    function withdraw(uint256 amount) external {
        require(userStacked[_msgSender()] >= amount , "Withdrawal amount is more than balance");
        require(userLock[_msgSender()] != LockType.NULL, "You do not have locked tokens");
        require(
            block.timestamp > expirationDeposit[_msgSender()] || unlockAll,
            "Expiration time of the deposit is not over"
        );
        (uint256 amountReward, uint32 lastRewardIndex) = getReward(_msgSender(), 0);
        require(lastRewardIndex == lastReward, "We cannot get reward in one transaction");
        if (amountReward > 0) {
            _harvest(userLock[_msgSender()], amountReward, lastRewardIndex);
        }
        totalStacked[userLock[_msgSender()]] = totalStacked[userLock[_msgSender()]].sub(amount);
        userStacked[_msgSender()] = userStacked[_msgSender()].sub(amount);
        if (userStacked[_msgSender()] == 0) {
            userLock[_msgSender()] = LockType.NULL;
        }
        erc20Deposit.safeTransfer(_msgSender(), amount);
        emit Withdraw(amount);
    }

    function reward(uint256 amount) external onlyOwner {
        require(amount > 0, "The amount of the reward must not be zero");
        require(erc20Reward.allowance(_msgSender(), address(this)) >= amount, "Not enough allowance");
        erc20Reward.safeTransferFrom(_msgSender(), address(this), amount);
        uint256 _stakedWithMultipliers = stakedWithMultipliers();
        uint256 amountWithAccumFee = address(erc20Deposit) == address(erc20Reward) ? amount.add(accumulatedFee) : amount;
        uint256 distributed;
        uint32 _lastReward = lastReward + 1;
        for (uint8 i = 0; i < lockTypes.length; i++) {
            if (i == lockTypes.length - 1) {
                uint256 remainder = amountWithAccumFee.sub(distributed);
                rewards[lockTypes[i]][_lastReward] = Reward(
                    remainder,
                    totalStacked[lockTypes[i]]
                );
                break;
            }
            uint256 staked = stakedWithMultiplier(lockTypes[i]);
            uint256 percent = staked.mul(PRECISION).div(_stakedWithMultipliers);
            uint amountPart = percent.mul(amountWithAccumFee).div(PRECISION);
            rewards[lockTypes[i]][_lastReward] = Reward(
                amountPart,
                totalStacked[lockTypes[i]]
            );
            distributed += amountPart;
        }
        lastReward = _lastReward;
        emit RewardPay(amount, accumulatedFee);
        accumulatedFee = 0;
    }

    function compound() public {
        require(userLock[_msgSender()] != LockType.NULL, "You do not have locked tokens");
        require(address(erc20Deposit) == address(erc20Reward), "Method not available");
        require(userLastReward[_msgSender()] != lastReward, "You have no accumulated reward");
        (uint256 amountReward, uint32 lastRewardIndex) = getReward(_msgSender(), 0);
        _compound(userLock[_msgSender()], amountReward, lastRewardIndex);
    }

    function harvest() public {
        require(userLock[_msgSender()] != LockType.NULL, "You do not have locked tokens");
        require(userLastReward[_msgSender()] != lastReward, "You have no accumulated reward");
        (uint256 amountReward, uint32 lastRewardIndex) = getReward(_msgSender(), userLastReward[_msgSender()]);
        _harvest(userLock[_msgSender()], amountReward, lastRewardIndex);
    }

    function _compound(LockType _userLock, uint256 _amountReward, uint32 lastRewardIndex) internal {
        userStacked[_msgSender()] = userStacked[_msgSender()].add(_amountReward);
        totalStacked[_userLock] = totalStacked[_userLock].add(_amountReward);
        userLastReward[_msgSender()] = lastRewardIndex;
        emit Compound(_userLock, _amountReward, lastRewardIndex);
    }

    function _harvest(LockType _userLock, uint256 _amountReward, uint32 lastRewardIndex) internal {
        userLastReward[_msgSender()] = lastRewardIndex;
        erc20Reward.safeTransfer(_msgSender(), _amountReward);
        emit Harvest(_userLock, _amountReward, lastRewardIndex);
    }

    function stakedWithMultipliers() public view returns (uint256) {
        uint256 reserves;
        for (uint8 i = 0; i < lockTypes.length; i++) {
            reserves = reserves.add(stakedWithMultiplier(lockTypes[i]));
        }
        return reserves;
    }

    function stakedWithMultiplier(LockType _lockType) public view returns (uint256) {
        return totalStacked[_lockType]
        .mul(locks[_lockType].multiplicator)
        .div(10);
    }

    function manyHarvests(address _user) public view returns (bool) {
        (uint256 amountReward, uint32 lastRewardIndex) = getReward(_user, 0);
        return (lastRewardIndex != lastReward);
    }

    function getReward(address _user, uint32 _lastRewardIndex) public view returns (uint256 amount, uint32 lastRewardIndex) {
        uint8 counter = 1;
        uint256 _amount;
        if (userLock[_user] == LockType.NULL) {
            return (0, lastReward);
        }
        uint256 balance = userStacked[_user];
        uint32 i = _lastRewardIndex != 0 ? _lastRewardIndex : userLastReward[_user];
        while (counter <= MAX_LOOPS && i < lastReward) {
            i++;
            counter++;
            Reward memory reward = rewards[userLock[_user]][i];
            _amount = _amount.add(balance.mul(PRECISION).div(reward.totalStacked).mul(reward.amount).div(PRECISION));
        }
        lastRewardIndex = i;
        amount = _amount;
    }
}
