const fs = require('fs')
const Web3 = require('web3')
const { APP_PATH, HTTP_PROVIDER, ADDRESS_ENCRYPT_KEY, IS_HOLON } = require('../config');
const homedir = APP_PATH || require('os').homedir()
const path = require('path')
const desktopEnvPath = path.join(homedir, '.zt', 'env.json')
const credentialPathName = path.join(homedir, '.zt', 'credential.json')
const appPathName = path.join(homedir, '.zt', 'app.json')
const ipnsPathName = path.join(homedir, '.zt', 'ipns.json')
const linkedinCookiePath = path.join(homedir, '.zt', 'cookies.json')
const proxyHolonPath = path.join(homedir, '.zt', 'proxyHolon.json')
const votesPath = path.join(homedir, '.zt', 'votes.json')
const umbrellaPath = path.join(homedir, '.zt', 'umbrella.json')
// For desktop app
const getEnvValue = () => {
  try {
    let rawdata = fs.readFileSync(desktopEnvPath)
    return JSON.parse(rawdata)
  } catch (e) {
    return {}
  }
}

const ENV_MODE = getEnvValue().MODE
const MODE = ENV_MODE || process.env.REACT_APP_MODE || process.env.NODE_ENV

const net = MODE === 'production' ? 'mainnet' : MODE === 'development' ? 'devnet' : MODE === 'staging' ? 'testnet' : 'privatenet'
const pathName = path.join(homedir, '.zt', net, 'eth.json')
const proxyData = path.join(homedir, '.zt', net, 'proxyData.json')
const historyPathName = path.join(homedir, '.zt', net, 'history.json')
const holonPathName = path.join(homedir, '.zt', net, 'holon.json')
const generalErrorsPathName = path.join(homedir, '.zt', 'generalError.json')
const developerErrorsPathName = path.join(homedir, '.zt', 'developerError.json')
const dir = path.join(homedir, '.zt')
const devnetDir = path.join(homedir, '.zt', 'devnet')
const mainnetDir = path.join(homedir, '.zt', 'mainnet')
const testnetDir = path.join(homedir, '.zt', 'testnet')
const privatenetDir = path.join(homedir, '.zt', 'privatenet')

const getStorageValues = (type = 'regular', decrypt = true) => {
  try {
    let rawdata = fs.readFileSync(type === 'regular' || type === 'eth' ? pathName : proxyData)
    const storage = JSON.parse(rawdata)
    if (MODE === "development" && type === 'regular') {
      let rawGanacheData = fs.readFileSync('/tmp/keys.json')
      let ganacheData = JSON.parse(rawGanacheData);
      let address = Object.keys(ganacheData.addresses)[0]

      return {
        ...storage,
        address,
        key: ganacheData.private_keys[address]
      }
    }

    if (typeof (storage.key) === 'string') {
      return storage
    } else {
      return {
        ...storage,
        key: decrypt ? decryptEthAddress(storage.key).privateKey : storage.key
      }
    }
  } catch (e) {
    return null
  }
}

const createFolders = () => {
  const createFolder = name => !fs.existsSync(name) && fs.mkdirSync(name)
  createFolder(dir)
  if (!IS_HOLON) {
    createFolder(devnetDir)
    createFolder(mainnetDir)
    createFolder(testnetDir)
    createFolder(privatenetDir)
  }
}

const getValues = (curPath, type = 'object') => {
  try {
    let rawdata = fs.readFileSync(curPath)
    return JSON.parse(rawdata)
  } catch (e) {
    return type === 'object' ? {} : type === 'array' ? [] : null
  }
}

const updateValues = async (curPath, values, type = 'object', shouldAppend = true, accType = 'regular') => {
  try {
    createFolders()
    const empty = type === 'object' ? {} : []
    const appValues = (curPath === (accType === 'regular' ? pathName : proxyData) ? await getStorageValues(accType, false) : await getValues(curPath, type)) || empty
    const newValues = shouldAppend ? (type === 'object' ? { ...appValues, ...values } : [...appValues, ...values]) : values
    const data = JSON.stringify(newValues)
    fs.writeFileSync(curPath, data)
  } catch (e) {
    throw (e)
  }
}
const updateEnvValue = values => updateValues(desktopEnvPath, values)

if (ENV_MODE === undefined) {
  updateEnvValue({ "MODE": MODE || "staging" })
}

const updateStorageValues = (address, key, currentUser, otherValues, type = 'regular') => updateValues(type === 'regular' ? pathName : proxyData, { address, key, keybaseUser: currentUser, ...otherValues }, undefined, undefined, 'proxy')
const updateVoterId = voterId => updateValues(pathName, { voterId: voterId })
const getAppValues = () => getValues(appPathName)
const updateAppValues = values => updateValues(appPathName, values)
const getIpnsValues = () => getValues(ipnsPathName)
const updateIpnsValues = values => updateValues(ipnsPathName, values)
const getHistoryValues = () => getValues(historyPathName, 'array')
const updateHistoryValues = values => updateValues(historyPathName, values, 'array')
const getCredentials = () => getValues(credentialPathName)
const setCredentials = (email, password, terms_conditions, passphrase) => updateValues(credentialPathName, { email, password, terms_conditions, passphrase })
const resetCredentials = password => updateValues(credentialPathName, { password })
const getHolon = () => getValues(holonPathName)
const setHolon = (id, port, rating, complaints) => updateValues(holonPathName, { id, port, rating, complaints })
const getLinkedinCookieValues = () => getValues(linkedinCookiePath)
const updateLinkedinCookieValues = values => updateValues(linkedinCookiePath, values, 'array', false)
const getProxyHolonValues = () => getValues(proxyHolonPath)
const updateProxyHolonValues = values => updateValues(proxyHolonPath, values, 'object', false)
const getVoteValues = () => getValues(votesPath)
const updateVoteValues = values => updateValues(votesPath, values, 'object')
const getGeneralErrorValues = () => getValues(generalErrorsPathName, 'array')
const updateGeneralErrorValues = (values, reset) => updateValues(generalErrorsPathName, values, 'array', !reset)
const getDeveloperErrorValues = () => getValues(developerErrorsPathName, 'array')
const updateDeveloperErrorValues = (values, reset) => updateValues(developerErrorsPathName, values, 'array', !reset)
const getUmbrellaPaths = () => getValues(umbrellaPath, 'object')
const updateUmbrellaPaths = (values) => updateValues(umbrellaPath, values, 'object', false)

const ensureAccountLoginAndGetDetails = async (accType = 'regular') => {
  const storage = await getStorageValues(accType)
  if (!storage.address) {
    throw ('You have not created your ethereum identity. Please use zerotheft create-identity to create your identity')
  }
  return storage
}

const decryptEthAddress = obj => {
  let web3 = new Web3(new Web3.providers.HttpProvider(HTTP_PROVIDER))
  return web3.eth.accounts.decrypt(obj, ADDRESS_ENCRYPT_KEY)
}


module.exports = {
  getAppValues,
  updateAppValues,
  getIpnsValues,
  updateIpnsValues,
  getEnvValue,
  updateEnvValue,
  getStorageValues,
  getCredentials,
  setCredentials,
  getHolon,
  setHolon,
  updateStorageValues,
  ensureAccountLoginAndGetDetails,
  updateVoterId,
  resetCredentials,
  getHistoryValues,
  updateHistoryValues,
  getLinkedinCookieValues,
  updateLinkedinCookieValues,
  getProxyHolonValues,
  updateProxyHolonValues,
  getVoteValues,
  updateVoteValues,
  getGeneralErrorValues,
  updateGeneralErrorValues,
  getDeveloperErrorValues,
  updateDeveloperErrorValues,
  getUmbrellaPaths,
  updateUmbrellaPaths
}
