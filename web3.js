const chainConfig = require("./config")

const Web3 = require("web3")
const BN = require('bignumber.js')

BN.config({
    EXPONENTIAL_AT: [-10, 64],
})

function getBN() {
    return BN
}

async function newWeb3(chain, pvkey) {
    const web3 = new Web3(chainConfig[chain].rpcUrls[0])
    const address = await web3.eth.accounts.privateKeyToAccount(pvkey).address
    await web3.eth.accounts.wallet.add(pvkey)

    return {
        web3: web3,
        address: address,
        pvkey: pvkey
    }
}

async function newContract(web3Context, abi, address) {
    return await new web3Context.web3.eth.Contract(abi, address);
};

async function queryContract(tx) {
    return await tx.call();
};

async function getGasEstimation(tx, address) {
    return tx? await tx.estimateGas({ from: address }): '35000';
}

async function getGasPrice(web3Context) {
    return await web3Context.web3.eth.getGasPrice()
}

async function executeTransactionBySign(web3Context, contractAddress, tx, value) {
    const networkId = await web3Context.web3.eth.net.getId()
    //   {
    //     address: '0x8f4DF07B38E5203eb81Ab4C523DeEAb0AC1f2749',
    //     privateKey: '0x76d7....c21d',
    //     signTransaction: [Function: signTransaction],
    //     sign: [Function: sign],
    //     encrypt: [Function: encrypt]
    //   }
    const address = web3Context.address
    const gas = await getGasEstimation(tx, address)
    const gasPrice = await getGasPrice(web3Context)

    const data = tx?.encodeABI()
    const nonce = await web3Context.web3.eth.getTransactionCount(address);

    const signedTx = await web3Context.web3.eth.accounts.signTransaction(
        {
            to: contractAddress,
            data,
            gas,
            gasPrice,
            nonce,
            value: value !== undefined? value: "0",
            chainId: networkId,
        },
        web3Context.pvkey
    );
    const receipt = await web3Context.web3.eth.sendSignedTransaction(signedTx.rawTransaction);

    console.log(`Transaction:`, receipt)
    return receipt;
};

async function executeContractByRaw(web3Context, contractAddress, tx, value) {
    const networkId = await web3Context.web3.eth.net.getId()
    const address = web3Context.address
    const gas = await getGasEstimation(tx, address)
    const gasPrice = await getGasPrice(web3Context)
    const data = tx?.encodeABI()
    const nonce = await web3Context.web3.eth.getTransactionCount(address);
    const txData = {
        from: address,
        to: contractAddress,
        data: data,
        gas,
        gasPrice,
        nonce,
        value: value !== undefined? value: "0",
        chainId: networkId,
    };

    const receipt = await web3Context.web3.eth.sendTransaction(txData);
    console.log(`Transaction:`, receipt)
    return receipt;
};

async function executeContract(web3Context, contractAddress, tx, value) {
    try {
        return await executeTransactionBySign(web3Context, contractAddress, tx, value)
    } catch (err) {
        console.log(err)
    }
}

module.exports = {getBN, newWeb3, newContract, queryContract, getGasEstimation, getGasPrice, executeTransactionBySign, executeContractByRaw, executeContract}