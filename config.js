const path = require('path')
const fs = require('fs')

let localConfig = {}
let stagingConfig = {}
let prodConfig = {}
let privateConfig = {}
let private2Config = {}
let stagingContracts = {}
let prodContracts = {}
let commonConfig = {}
try { localConfig = require('../../config.json') } catch (e) { }
try { privateConfig = require('../../config.private.json') } catch (e) { }
try { private2Config = require('../../config.private2.json') } catch (e) { }
try { stagingConfig = require('../../config.staging.json') } catch (e) { }
try { prodConfig = require('../../config.production.json') } catch (e) { }
try { stagingContracts = require('../../contracts.staging.json') } catch (e) { }
try { prodContracts = require('../../contracts.production.json') } catch (e) { }
try { commonConfig = require('../../config.common.json') } catch (e) { }

// const isPkg = typeof process.pkg !== 'undefined'
// const mainPath = commonConfig.IS_HOLON ? commonConfig.MAIN_PATH : null
const homedir = commonConfig.IS_HOLON ? commonConfig.MAIN_PATH : require('os').homedir()
const desktopEnvPath = path.join(homedir, '.zt', 'env.json')

const getEnvValue = () => {
  try {
    let rawdata = fs.readFileSync(desktopEnvPath)
    return JSON.parse(rawdata)
  } catch (e) {
    return {}
  }
}

let currentEnv = getEnvValue().MODE

let MODE = currentEnv || process.env.REACT_APP_MODE || process.env.NODE_ENV;
const envConfig = !MODE || MODE === "development" ? localConfig : MODE === "staging" ? stagingConfig : MODE === "production" ? prodConfig : privateConfig
if (!MODE) {
  MODE = envConfig.MODE || 'development'
}
const contracts = MODE === "development" ? {} : MODE === "staging" ? stagingContracts : MODE === "production" ? prodContracts : {}
module.exports = {
  SHOULD_VALIDATE: envConfig.SHOULD_VALIDATE !== false,
  HTTP_PROVIDER: envConfig.HTTP_PROVIDER || 'http://localhost:8545',
  WEB_PROVIDER: envConfig.WEB_PROVIDER || 'ws://localhost:8545',
  ADDRESS_ENCRYPT_KEY: envConfig.ADDRESS_ENCRYPT_KEY || 'zerotheft123',
  MODE: MODE,
  GIT_TOKEN: envConfig.GIT_API_TOKEN,
  ...contracts,
  ...envConfig,
  ...commonConfig,
  MAIN_PATH: homedir,
  GAS_LIMIT: envConfig.GAS_LIMIT || 300000
}
