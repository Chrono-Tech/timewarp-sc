module.exports = async ({
                            getNamedAccounts,
                            deployments,
                            getChainId,
                            getUnnamedAccounts,
                        }) => {
    console.log('point 1')
    const {deploy} = deployments;
    const {deployer} = await getNamedAccounts();

    // await deploy('ERC20', {
    //     from: deployer,
    //     gasLimit: 9000000,
    //     gasPrice: 5,
    //     args: ['TIME', 'TIME', 18],
    // });

    await deploy('TimeWarpPool', {
        from: deployer,
        // gasLimit: 9000000,
        // gasPrice: 10000000000,
        args: [],
    });
};
