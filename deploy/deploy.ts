module.exports = async ({
                            getNamedAccounts,
                            deployments,
                            getChainId,
                            getUnnamedAccounts,
                        }) => {
    const {deploy} = deployments;
    const {deployer} = await getNamedAccounts();

    // the following will only deploy "GenericMetaTxProcessor" if the contract was never deployed or if the code changed since last deployment
    await deploy('ERC20', {
        from: deployer,
        gasLimit: 4000000,
        args: ['TIME', 'TIME', 18],
    });

    await deploy('TimeWarpPool', {
        from: deployer,
        gasLimit: 6000000,
    });
};
