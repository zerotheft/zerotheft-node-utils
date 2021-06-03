const fs = require('fs')
const { getProposalContract, getVoterContract } = require('../utils/contract')
const { convertStringToHash } = require('../utils/web3')
const { getProposalDetails } = require('./proposals')

/*
* Get user earlier vote to the proposal
*/
const userPriorVote = async body => {
  const voterC = getVoterContract()
  const proposalC = getProposalContract()
  try {
    if (!body.address) throw new Error('user address not present for prior vote')
    let priorvoteID = await voterC.callSmartContractGetFunc('getUserSpecificVote', [body.address, convertStringToHash(body.url)])
    if (priorvoteID <= 0) throw new Error('no prior votes')
    const vote = await voterC.callSmartContractGetFunc('getVote', [parseInt(priorvoteID)])
    const proposal = await getProposalDetails(vote.proposalID, proposalC, voterC)

    return { success: true, id: priorvoteID, theftAmt: proposal.theftAmt, ...vote }
  }
  catch (e) {
    console.log('userPriorVote::', e.message)
    return { success: false, error: e.message }

  }
}

/*
* List vote ids only
*/
const listVoteIds = async (contract = null) => {
  if (!contract) {
    contract = getVoterContract()
  }
  let cursor = 0;
  let howMany = 1000; // Get thousands at a time
  let allIds = []
  try {
    do {
      let voteIds = await contract.callSmartContractGetFunc('getVoteIDsByCursor', [cursor, howMany])
      allIds = allIds.concat(voteIds)
      cursor = cursor + howMany
    } while (1)
  }
  catch (e) {
    console.log(e.message)
  }
  return allIds
}

/*
* Get all votes
*/
const getAllVoteIds = async () => {
  const contract = getVoterContract()
  try {
    let allVoteIds = await listVoteIds(contract)
    // allVoteIds=
    // const promises = allVoteIds.map(async (voteID) => {
    let allVotes = []
    for (let i = 0; i < allVoteIds.length; i++) {
      let voteID = allVoteIds[i]
      console.log('voteID about to export is ', voteID)
      try {
        const vote = await contract.callSmartContractGetFunc('getVote', [parseInt(voteID)])
        const { voter, voteType, proposalID, altTheftAmt, comment, date } = vote
        const voteExtra = await contract.callSmartContractGetFunc('getVoteExtra', [parseInt(voteID)])
        const { holon, isFunded, isArchive } = voteExtra

        allVotes.push({
          "id": voteID,
          voter,
          voteType,
          "proposal": proposalID,
          altTheftAmt,
          comment,
          holon,
          isFunded,
          isArchive,
          "timestamp": date
        })

        // return voteData
      } catch (e) {
        var voterLog = fs.createWriteStream('/tmp/error-votes.log', { flags: 'a' })
        var message = new Date().toISOString() + " : voteId=>" + voteID + "\n";
        voterLog.write(message);

        console.log(e)
        continue
      }
    }
    // const allVotes = await Promise.all(promises)
    return { success: true, allVotes }
  }
  catch (e) {
    console.log(e)
    return { success: false, error: e.message }

  }
}
module.exports = {
  userPriorVote,
  listVoteIds,
  getAllVoteIds
}
