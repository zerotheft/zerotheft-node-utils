const Web3 = require('./Web3Class')

const getPermissionContract = () => getContract('PermissionHandler')
const getProposalContract = () => getContract('ProposalHandler')
const getVoterContract = () => getContract('VoteHandler')
const getUserContract = () => getContract('UserHandler')
const getPathContract = () => getContract('PathHandler')
const getHolonContract = () => getContract('HolonHandler')
const getWalletContract = () => getContract('WalletHandler')

const getContract = contractName => new Web3(contractName)

module.exports = {
  getPermissionContract,
  getProposalContract,
  getVoterContract,
  getUserContract,
  getPathContract,
  getHolonContract,
  getWalletContract
}
