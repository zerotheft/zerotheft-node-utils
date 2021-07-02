const Web3 = require('./Web3Class')

const getPermissionContract = () => getContract('ZTMPermissions')
const getProposalContract = () => getContract('ZTMProposals')
const getVoterContract = () => getContract('ZTMVotes')
const getCitizenContract = () => getContract('ZTMCitizens')
const getVerifiedCitizenContract = () => getContract('ZTMVerifiedCitizens')
const getPathContract = () => getContract('ZTMPaths')
const getHolonContract = () => getContract('ZTMHolons')
const getWalletContract = () => getContract('ZTMWallets')

const getContract = contractName => new Web3(contractName)

module.exports = {
  getPermissionContract,
  getProposalContract,
  getVoterContract,
  getCitizenContract,
  getVerifiedCitizenContract,
  getPathContract,
  getHolonContract,
  getWalletContract
}
