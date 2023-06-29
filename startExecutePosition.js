const fs = require('fs')
const BN = require('bignumber.js')

BN.config({
    EXPONENTIAL_AT: [-10, 100]
})

const { newContract, newWeb3, queryContract, executeContract, getGasEstimation } = require('./web3')
const { sleep } = require('./common')
const tokenArray = require('../GMX-MEME-SmartContract/scripts/core/tokens.js')

async function main() {
    const pvkey = fs.readFileSync('.env').toString().trim()
    const PriceFeedExt = JSON.parse(fs.readFileSync('./abi/PriceFeedExt.json').toString())
    const FastPriceFeed = JSON.parse(fs.readFileSync('./abi/FastPriceFeed.json').toString())
    const PositionRouter = JSON.parse(fs.readFileSync('./abi/PositionRouter.json').toString())
    const PositionManager = JSON.parse(fs.readFileSync('./abi/PositionManager.json').toString())
    const Vault = JSON.parse(fs.readFileSync('./abi/Vault.json').toString())
    let coreData = JSON.parse(fs.readFileSync('../GMX-MEME-SmartContract/scripts/deploy-core.json').toString())
    addresses = {}
    for (let i of coreData){
        addresses[i.name] = i.imple
    }
    const priceFeedInfo = addresses.FastPriceFeed
    const positionRouterInfo = addresses.PositionRouter
    const positionManagerInfo = addresses.PositionManager
    const vaultInfo = addresses.Vault

    const coreContext = await newWeb3('goerli_ethereum', pvkey)
    console.log("Starting position router server by", coreContext.address)

    const fastPriceFeedContract = await newContract(coreContext, FastPriceFeed.abi, priceFeedInfo)
    const positionRouterContract = await newContract(coreContext, PositionRouter.abi, positionRouterInfo)
    const positionManagerContract = await newContract(coreContext, PositionManager.abi, positionManagerInfo)
    const vaultContract = await newContract(coreContext, Vault.abi, vaultInfo)

    let tokens = []
    let precisions = []

    for (let i = 0; ; i++) {
        try {
            tokens = [...tokens, await queryContract(fastPriceFeedContract.methods.tokens(i))]
            precisions = [...precisions, await queryContract(fastPriceFeedContract.methods.tokenPrecisions(i))]
        } catch {
            break
        }
    }

    console.log('detected tokens')
    let priceFeeds = []
    for (let i = 0; i < tokens.length; i++) {
        const addr = tokens[i]
        let foundItem
        for (const token in tokenArray['core']) {
            if (tokenArray['core'][token].address.toLowerCase() === addr.toLowerCase()) {
                foundItem = tokenArray['core'][token]
                break
            }
        }

        if (foundItem) {
            console.log(i + 1, 'token', addr)
            console.log(i + 1, 'precision', precisions[i].toString())
            console.log('')
            console.log(foundItem)

            priceFeeds = [...priceFeeds, foundItem.priceFeed]
        }
        console.log('')
    }

    let priceFeederContracts = []
    for (const p of priceFeeds) {
        priceFeederContracts = [...priceFeederContracts, await newContract(coreContext, PriceFeedExt.abi, p)]
    }

    while (1) {
        const testing = 0
        try {
            let priceBits = BN(0)
            let ta = []
            let pr = []

            for (let i = 0; i < precisions.length; i++) {
                const pc = (await queryContract(priceFeederContracts[i].methods.latestAnswer()))
                const t = await queryContract(fastPriceFeedContract.methods.tokens(i))
                const p = await queryContract(fastPriceFeedContract.methods.tokenPrecisions(i))

                ta = [...ta, t]
                pr = [...pr, p.toString()]

                if (pc.toString() === '0') {
                    throw new Error(`${tokens[i]}: price could not be obtained`)
                }

                priceBits = priceBits.plus(BN(pc.toString()).times(precisions[i].toString()).div('100000000').integerValue().times(BN(2).pow(32 * i)))
            }

            let startIncreaseIdx = await queryContract(positionRouterContract.methods.increasePositionRequestKeysStart())
            startIncreaseIdx = parseInt(startIncreaseIdx.toString())
            let endIncreaseIdx
            {
                for (i = startIncreaseIdx; ; i++) {
                    try {
                        await queryContract(positionRouterContract.methods.increasePositionRequestKeys(i))
                    } catch {
                        break;
                    }
                }
                endIncreaseIdx = i
            }

            console.log('Position increase >>>', 'start:', startIncreaseIdx, "end:", endIncreaseIdx)

            let startDecreaseIdx = await queryContract(positionRouterContract.methods.decreasePositionRequestKeysStart())
            startDecreaseIdx = parseInt(startDecreaseIdx.toString())
            let endDecreaseIdx
            {
                for (i = startDecreaseIdx; ; i++) {
                    try {
                        await queryContract(positionRouterContract.methods.decreasePositionRequestKeys(i))
                    } catch {
                        break;
                    }
                }
                endDecreaseIdx = i
            }

            console.log('Position decrease >>>', 'start:', startDecreaseIdx, "end:", endDecreaseIdx)

            if (testing > 0) {
                if (endIncreaseIdx > 0) {
                    const key = await queryContract(positionRouterContract.methods.increasePositionRequestKeys(endIncreaseIdx - 1))
                    const isLeverageEnabled = await queryContract(positionRouterContract.methods.isLeverageEnabled())
                    const minBlockDelayKeeper = await queryContract(positionRouterContract.methods.minBlockDelayKeeper())
                    const isPositionKeeper = await queryContract(positionRouterContract.methods.isPositionKeeper(coreContext.address))
                    const request = await queryContract(positionRouterContract.methods.increasePositionRequests(key))
                    const isUpdater = await queryContract(fastPriceFeedContract.methods.isUpdater(coreContext.address))
                    const isLiquidator = await queryContract(positionManagerContract.methods.isLiquidator(coreContext.address))

                    const account = '0x2A567DDf64eDE5782f416A1e729504a31990f957'
                    const collateralToken = '0x5C7F8A570d578ED84E63fdFA7b1eE72dEae1AE23'
                    const indexToken = '0x5C7F8A570d578ED84E63fdFA7b1eE72dEae1AE23'
                    const isLong = true
                    const positionKey = await queryContract(vaultContract.methods.getPositionKey(account, collateralToken, indexToken, isLong))
                    const position = await queryContract(vaultContract.methods.positions(positionKey))
                    const maxLeverage = await queryContract(vaultContract.methods.maxLeverage())
                    console.log('address', coreContext.address)
                    console.log('minBlockDelayKeeper', minBlockDelayKeeper.toString())
                    console.log('isLeverageEnabled', isLeverageEnabled)
                    console.log('isPositionKeeper', isPositionKeeper)
                    console.log('isUpdater', isUpdater)
                    console.log('isLiquidator', isLiquidator)
                    console.log('key', key)
                    console.log('request', request)
                    console.log('tokens', ta)
                    console.log('precisions', pr)
                    console.log('positionKey', positionKey)
                    console.log('position', position)
                    console.log('max leverage', maxLeverage.toString())

                    // const reserveAmount = await queryContract(vaultContract.methods.reservedAmounts('0x191E94fa59739e188dcE837F7f6978d84727AD01'))
                    // const poolAmount = await queryContract(vaultContract.methods.poolAmounts('0x191E94fa59739e188dcE837F7f6978d84727AD01'))
                    // console.log('reserveAmount', reserveAmount.toString())
                    // console.log('poolAmount', poolAmount.toString())
                    if (startIncreaseIdx < endIncreaseIdx || true) {
                        try {
                            // const gas = await getGasEstimation(positionManagerContract.methods.liquidatePosition(account, collateralToken, indexToken, isLong, coreContext.address), coreContext.address)
                            const gas = await getGasEstimation(positionRouterContract.methods.executeIncreasePosition(key, coreContext.address), coreContext.address)
                            // const gas = await getGasEstimation(fastPriceFeedContract.methods.setPricesWithBitsAndExecute(
                            //     positionRouterInfo,
                            //     priceBits.toString(),
                            //     Math.floor((new Date()).getTime() / 1000),
                            //     endIncreaseIdx,
                            //     endDecreaseIdx,
                            //     endIncreaseIdx - startIncreaseIdx,
                            //     endDecreaseIdx - startDecreaseIdx
                            // ),
                            //     coreContext.address
                            // )
                            console.log('gas', gas.toString())
                        } catch (err) {
                            console.log(err)
                        }
                    }
                }
            } else {
                if (startIncreaseIdx < endIncreaseIdx || startDecreaseIdx < endDecreaseIdx) {
                    console.log("Eagle", priceBits.toString(),
                        Math.floor((new Date()).getTime() / 1000),
                        endIncreaseIdx,
                        endDecreaseIdx,
                        endIncreaseIdx - startIncreaseIdx,
                        endDecreaseIdx - startDecreaseIdx);

                    try {
                        await executeContract(coreContext, fastPriceFeedContract._address, fastPriceFeedContract.methods.setPricesWithBitsAndExecute(
                            positionRouterInfo,
                            priceBits.toString(),
                            Math.floor((new Date()).getTime() / 1000),
                            endIncreaseIdx,
                            endDecreaseIdx,
                            endIncreaseIdx - startIncreaseIdx,
                            endDecreaseIdx - startDecreaseIdx
                        )
                        )
                    } catch (err) {
                        console.log(err)
                    }
                }
            }
        } catch (err) {
            console.log(err)
            console.log("Waiting 30s for RPC")
            await sleep(30000)
            process.exit();
        }

        console.log(coreContext.address, coreContext.web3.utils.fromWei(await coreContext.web3.eth.getBalance(coreContext.address)), "Goerli Ethereum")

        if (testing > 0) {
            await sleep(60000)
        } else {
            await sleep(3000)
        }
    }
}

main()
    .then(() => { })
    .catch(err => {
        console.log(err)
        process.exit();
    })