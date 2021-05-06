import {task} from "hardhat/config";
import "@nomiclabs/hardhat-waffle";

require('hardhat-deploy');

// This is a sample Hardhat task. To learn how to create your own go to
// https://hardhat.org/guides/create-task.html
task("accounts", "Prints the list of accounts", async (args, hre) => {
    const accounts = await hre.ethers.getSigners();

    for (const account of accounts) {
        console.log(await account.address);
    }
});

// You need to export an object to set up your config
// Go to https://hardhat.org/config/ to learn more

/**
 * @type import('hardhat/config').HardhatUserConfig
 */
module.exports = {
    solidity: "0.8.0",
    networks: {
        hardhat: {
            // forking: {
            //   url: "https://bsc-dataseed.binance.org/",
            // },
            // mining: {
            //   auto: false,
            //   interval: 1000
            // },
            // chainId: 1337,
            // loggingEnabled: true,
            allowUnlimitedContractSize: true,
        },
        rinkeby: {
            url: "https://rinkeby.infura.io/v3/901360f9b16940c0a0c7d7a323faed88",
            accounts: ['0x4fdb8f894cc882f8a74a2c84fc9e8ac0a53b3a62ddb505ebb0c54a4135079b9d']
        },
        "binance-testnet": {
            url: "https://data-seed-prebsc-2-s1.binance.org:8545/",
            accounts: ['0x4fdb8f894cc882f8a74a2c84fc9e8ac0a53b3a62ddb505ebb0c54a4135079b9d']
        }
    },
    mocha: {
        bail: true,
        timeout: 15000,
    },
    include: ["./scripts"],
    namedAccounts: {
        deployer: {
            default: 0, // here this will by default take the first account as deployer
            1: 0,
        },
    }
};

