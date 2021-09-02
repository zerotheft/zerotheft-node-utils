const Web3 = require('./Web3Class')

const getContract = contractName => new Web3(contractName)

const getPermissionContract = () => getContract('ZTMPermissions')
const getProposalContract = () => getContract('ZTMProposals')
const getVoteContract = () => getContract('ZTMVotes')
const getCitizenContract = () => getContract('ZTMCitizens')
const getVerifiedCitizenContract = () => getContract('ZTMVerifiedCitizens')
const getPathContract = () => getContract('ZTMEconomicHierarchy')
const getHolonContract = () => getContract('ZTMHolons')
const getWalletContract = () => getContract('ZTMWallets')
const getFeedbackContract = () => getContract('ZTMFeedbacks')

module.exports = {
  getPermissionContract,
  getProposalContract,
  getVoteContract,
  getCitizenContract,
  getVerifiedCitizenContract,
  getPathContract,
  getHolonContract,
  getWalletContract,
  getFeedbackContract,
}
