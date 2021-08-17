const Web3 = require('web3')
const fs = require('fs')

const EthereumTx = require('ethereumjs-tx').Transaction
const { ensureAccountLoginAndGetDetails, updateStorageValues, getStorageValues } = require('./storage')
const { fetch } = require('./api')
const { HTTP_PROVIDER, ETH_HTTP_PROVIDER, WEB_PROVIDER, ADDRESS_ENCRYPT_KEY, MODE, GAS_PRICE } = require('../config')
const config = require('../config')
const { encrypt } = require('./encryptor')
const { generateMnemonic, EthHdWallet } = require('eth-hd-wallet')
const Common = require('ethereumjs-common')

const createMockAccount = () => {
  let web3 = initiateWeb3()
  return web3.eth.accounts.create();
}

const createAccount = async (accType = 'regular', importedMnemonic) => {
  let web3 = initiateWeb3()

  const mnemonic = importedMnemonic || generateMnemonic()
  const wallet = EthHdWallet.fromMnemonic(mnemonic)
  const [address] = wallet.generateAddresses(1)
  const privateKey = wallet.getPrivateKey(address).toString('hex')
  const encryptedKey = web3.eth.accounts.encrypt(privateKey, ADDRESS_ENCRYPT_KEY);

  await updateStorageValues(address, privateKey, null, { mnemonic: encrypt(mnemonic, ADDRESS_ENCRYPT_KEY) }, accType)

  return {
    address,
    privateKey,
    encryptedKey,
    mnemonic
  }
}

const importByPrivateKey = async (privateKey) => {
  let web3 = initiateWeb3()

  const account = web3.eth.accounts.privateKeyToAccount(privateKey)
  const encryptedKey = web3.eth.accounts.encrypt(account.privateKey, ADDRESS_ENCRYPT_KEY);
  return {
    address: account.address,
    encryptedKey
  }
}

const decryptEthAddress = obj => {
  let web3 = initiateWeb3()
  return web3.eth.accounts.decrypt(obj, ADDRESS_ENCRYPT_KEY)
}



const transferFund = async (from, to, privateKey, amount, accType = 'regular', gasPrice = GAS_PRICE) => {
  try {
    const web3 = initiateWeb3(undefined, accType)
    const storage = await ensureAccountLoginAndGetDetails(accType)
    const without0x = privateKey.split('0x')[1]
    const newPrivateKey = without0x || privateKey
    return carryTransaction(web3, from, newPrivateKey, {
      to: to || storage.address,
      value: web3.utils.toHex(web3.utils.toWei(amount.toString(), 'ether')),
      gasLimit: web3.utils.toHex(config.GAS_LIMIT || 300000),
      gasPrice: web3.utils.toHex(web3.utils.toWei((gasPrice || "1").toString(), 'gwei'))
    }, accType)
  } catch (e) {
    throw (e)
  }
}

const getBalance = async (accType = 'regular') => {
  const storage = await ensureAccountLoginAndGetDetails(accType)
  if (!storage) return
  const web3 = initiateWeb3(undefined, accType)
  const bal = await web3.eth.getBalance(storage.address)
  return bal ? web3.utils.fromWei(bal, 'ether') : 0
}


const initiateWeb3 = (provider, accType = 'regular') => {
  return new Web3((provider === 'websocket' ? new Web3.providers.WebsocketProvider(WEB_PROVIDER) : new Web3.providers.HttpProvider(accType === 'eth' ? ETH_HTTP_PROVIDER : HTTP_PROVIDER)))
}

const instantiateContract = async (web3, contractName) => {
  if (MODE === 'development' || MODE === 'private') {
    let contract = {}
    if (MODE === 'development')
      contract = JSON.parse(fs.readFileSync(`${config.ZERO_THEFT_CONTRACT}/${contractName}.json`))
    else
      contract = await fetch(`${config.ZERO_THEFT_CONTRACT}/${contractName}.json`)
    const networkId = await web3.eth.net.getId()
    const deployedNetwork = contract.networks[networkId]
    return [new web3.eth.Contract(contract.abi, deployedNetwork && deployedNetwork.address), deployedNetwork.address]
  } else {
    const { address, implementation } = config[contractName]
    // let res = {}
    let res = await fetch(`https://blockscout.com/etc/${config.network}/api?module=contract&action=getabi&address=${implementation}`)
    // if (config.network === "kotti" || config.network === "mainnet") {
    // } else {
    //   res = await fetch(`https://api${config.network ? '-' + config.network : ''}.etherscan.io/api?module=contract&action=getabi&address=${implementation}&apikey=${config.ETHERSCAN_API_KEY}`)
    // }
    return [new web3.eth.Contract(JSON.parse(res.result), address), address]
  }
}

const carryTransaction = async (web3, address, privateKey, obj, networkType = 'regular') => {
  try {
    // const pend = await web3.eth.getTransactionCount(address, 'pending')
    let customCommon = {}
    const txCount = await web3.eth.getTransactionCount(address)
    let txArgs = {
      "chain": config.network
    }
    if (MODE === 'production' && networkType === 'eth') {
      txArgs = { "chain": "mainnet" }
    }
    else if ((MODE === 'staging' || MODE === 'private') && networkType === 'eth') {
      txArgs = { "chain": "ropsten" }
    }
    const txObject = {
      ...{
        nonce: web3.utils.toHex(txCount),
        gasLimit: web3.utils.toHex(config.GAS_LIMIT || 300000),
        gasPrice: web3.utils.toHex(web3.utils.toWei((GAS_PRICE || "1").toString(), 'gwei'))
      }, ...obj
    }
    let networkId, chainId;

    if (networkType !== 'eth' && (config.network === "kotti" || config.network === "mainnet")) {
      networkId = (config.network === "kotti") ? 6 : 1;
      chainId = (config.network === "kotti") ? 6 : 61;
    } else if (config.network === "geth") {
      networkId = chainId = config.NETWORK_ID;
    }

    let tx;
    if ((MODE === 'development' || MODE === 'private') && networkType !== 'eth' && config.network !== "geth") {
      tx = new EthereumTx(txObject)
    } else {
      customCommon = Common.default.forCustomChain(
        "mainnet",
        {
          name: config.network,
          networkId,
          chainId
        },
        'byzantium',
      )
      txArgs = { common: customCommon }
      tx = new EthereumTx(txObject, txArgs)
    }

    tx.sign(Buffer.from(privateKey, 'hex'))
    const serializedTransaction = tx.serialize()
    const raw = '0x' + serializedTransaction.toString('hex')

    return web3.eth.sendSignedTransaction(raw)
  } catch (e) {
    throw e
  }
}

const convertStringToBytes = item => {
  const web3 = initiateWeb3()
  return web3.utils.fromAscii(item)
}

const convertBytesToString = (item, trim = false) => {
  const web3 = initiateWeb3()
  const val = web3.utils.toAscii(item)
  if (trim) return val.replace(/\0.*$/g, '')
  return val
}

const convertStringToHash = (item) => {
  const web3 = initiateWeb3()
  const val = web3.utils.keccak256(item)
  return val
}

/**
 * Conversts string to correct bytes32
 **/
const convertToAscii = (item) => {
  const web3 = initiateWeb3()
  const val = web3.utils.asciiToHex(item)
  return val
}

/**
 * This method converts the hex value to respective Ascii
 * @params hexValue - value that is ready or conversion
 * @returns ascii value of respective hex value
 **/
const convertHexToAscii = (hexValue) => {
  const web3 = initiateWeb3()
  const val = web3.utils.hexToAscii(hexValue)
  return val
}


/**
 * Sign a params and returns a signed message
 * @params params parameters to generate a sha3 hash value
 * @params signer account details of a signer
 * @returns signedMessage The signature
 **/
const signMessage = async (params, signer = null) => {
  if (!signer) signer = getStorageValues()

  const web3 = initiateWeb3()
  let sha3 = web3.utils.soliditySha3(...params)
  const signedMessage = await web3.eth.accounts.sign(sha3, signer.key)
  // const signedMessage = await web3.eth.sign(sha3, signer.address)
  // let signedMessage = await web3.eth.sign("0x5fe7f977e71dba2ea1a68e21057beebb9be2ac30c6410aa38d4f3fbe41dcffd2", "0xCD4f2b154dd0553bfC51cCE4356a23956d97490d")

  // console.log(sha3, "====", signer, "===", signedMessage)

  // const recoer = await web3.eth.accounts.recover("0x5fe7f977e71dba2ea1a68e21057beebb9be2ac30c6410aa38d4f3fbe41dcffd2", signedMessage);
  // console.log(recoer)
  return signedMessage
}

module.exports = {
  createAccount,
  importByPrivateKey,
  transferFund,
  decryptEthAddress,
  getBalance,
  initiateWeb3,
  instantiateContract,
  convertBytesToString,
  convertStringToBytes,
  convertStringToHash,
  carryTransaction,
  createMockAccount,
  convertToAscii,
  convertHexToAscii,
  signMessage
}
