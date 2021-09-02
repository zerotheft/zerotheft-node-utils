/* eslint-disable no-empty */
const homedir = require('os').homedir()
const path = require('path')
const fs = require('fs')

let localConfig = {}
let stagingConfig = {}
let prodConfig = {}
let privateConfig = {}
let stagingContracts = {}
let prodContracts = {}
let commonConfig = {}
try {
  localConfig = require('../../config.json')
} catch (e) {}
try {
  privateConfig = require('../../config.private.json')
} catch (e) {}
try {
  stagingConfig = require('../../config.staging.json')
} catch (e) {}
try {
  prodConfig = require('../../config.production.json')
} catch (e) {}
try {
  stagingContracts = require('../../contracts.staging.json')
} catch (e) {}
try {
  prodContracts = require('../../contracts.production.json')
} catch (e) {}
try {
  commonConfig = require('../../config.common.json')
} catch (e) {}

// const isPkg = typeof process.pkg !== 'undefined'
// const mainPath = commonConfig.IS_INSTALLER ? commonConfig.MAIN_PATH : null
// const maindir = commonConfig.IS_INSTALLER ? path.join(homedir, commonConfig.ZEROTHEFT_DIR) : homedir
const maindir = path.join(homedir, commonConfig.ZEROTHEFT_DIR)

const desktopEnvPath = path.join(maindir, '.zt', 'env.json')

const getEnvValue = () => {
  try {
    const rawdata = fs.readFileSync(desktopEnvPath)
    return JSON.parse(rawdata)
  } catch (e) {
    return {}
  }
}

const currentEnv = getEnvValue().MODE

let MODE = currentEnv || process.env.REACT_APP_MODE || process.env.NODE_ENV
// eslint-disable-next-line no-nested-ternary
const envConfig =
  !MODE || MODE === 'development'
    ? localConfig
    : MODE === 'staging'
    ? stagingConfig
    : MODE === 'production'
    ? prodConfig
    : privateConfig
if (!MODE) {
  MODE = envConfig.MODE || 'development'
}

const contracts =
  // eslint-disable-next-line no-nested-ternary
  MODE === 'development' ? {} : MODE === 'staging' ? stagingContracts : MODE === 'production' ? prodContracts : {}

module.exports = {
  SHOULD_VALIDATE: envConfig.SHOULD_VALIDATE !== false,
  HTTP_PROVIDER: envConfig.HTTP_PROVIDER || 'http://localhost:8545',
  WEB_PROVIDER: envConfig.WEB_PROVIDER || 'ws://localhost:8545',
  ADDRESS_ENCRYPT_KEY: envConfig.ADDRESS_ENCRYPT_KEY || 'zerotheft123',
  MODE,
  ...contracts,
  ...envConfig,
  ...commonConfig,
  APP_PATH: maindir,
  GAS_LIMIT: envConfig.GAS_LIMIT || 300000,
}
