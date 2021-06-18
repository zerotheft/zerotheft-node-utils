const fs = require('fs')
const { get, remove, uniq } = require('lodash')
const { getProposalContract, getVoterContract } = require('../utils/contract')
const { convertStringToHash, convertToAscii } = require('../utils/web3')
const { getProposalDetails } = require('./proposals')
const { userSpecificVotesFile, proposalVotesFile, proposalArchiveVotesFile, proposalVotersFile, writeFile, voteDataRollupsFile } = require('../utils/common')



const updateVoteDataRollups = async (rollups, voteData, proposalInfo, voterC) => {
  // keep the roll ups record in file
  let _voter = get(rollups.userSpecificVotes, (voteData.voter).toLowerCase(), {})
  console.log(_voter)
  let _vote = get(_voter, (proposalInfo.path).toLowerCase(), (voteData.voteID).toLowerCase())
  _voter[(proposalInfo.path).toLowerCase()] = _vote.toLowerCase()
  rollups.userSpecificVotes[(voteData.voter).toLowerCase()] = _voter

  // if prior Vote is present
  console.log(voteData, voteData.voteReplaces)
  if (!voteData.voteReplaces.includes(convertToAscii(0))) {
    const _priorVote = await voterC.callSmartContractGetFunc('getVote', [voteData.voteReplaces])

    let _priorPVotes = get(rollups.proposalVotes, (_priorVote.proposalID).toLowerCase(), [])
    remove(_priorPVotes, (_v) => {
      return (_v).toLowerCase() === (voteData.voteReplaces).toLowerCase()
    })
    let _pArchiveVotes = get(rollups.proposalArchiveVotes, (voteData.proposalID).toLowerCase(), [])
    _pArchiveVotes.push((voteData.voteReplaces).toLowerCase())
    rollups.proposalArchiveVotes[(voteData.proposalID).toLowerCase()] = uniq(_pArchiveVotes)
  }

  let _pvotes = get(rollups.proposalVotes, (voteData.proposalID).toLowerCase(), [])
  _pvotes.push((voteData.voteID).toLowerCase())
  rollups.proposalVotes[(voteData.proposalID).toLowerCase()] = uniq(_pvotes)

  let _pvoters = get(rollups.proposalVoters, (voteData.proposalID).toLowerCase(), [])
  _pvoters.push((voteData.voter).toLowerCase())
  rollups.proposalVoters[(voteData.proposalID).toLowerCase()] = uniq(_pvoters)
}

//save vote roll ups date
const saveVoteRollupsData = async (voteData) => {
  if (voteData.userSpecificVotes) await writeFile(userSpecificVotesFile, voteData.userSpecificVotes)
  if (voteData.proposalVotes) await writeFile(proposalVotesFile, voteData.proposalVotes)
  if (voteData.proposalVoters) await writeFile(proposalVotersFile, voteData.proposalVoters)
  if (voteData.proposalArchiveVotes) await writeFile(proposalArchiveVotesFile, voteData.proposalArchiveVotes)
}
/*
* Get user earlier vote to the proposal
*/
const userPriorVote = async body => {
  const voterC = getVoterContract()
  const proposalC = getProposalContract()
  try {
    if (!body.address) throw new Error('user address not present for prior vote')

    let { userSpecificVotes } = await voteDataRollupsFile()
    // let priorvoteID = await voterC.callSmartContractGetFunc('getUserSpecificVote', [body.address, convertStringToHash(body.url)])
    let priorvoteID = (!isEmpty(userSpecificVotes) && userSpecificVotes[body.address]) ? get(userSpecificVotes[body.address], convertStringToHash(body.url), 0) : 0
    if (priorvoteID <= 0) throw new Error('no prior votes')
    const vote = await voterC.callSmartContractGetFunc('getVote', [priorvoteID])
    const proposal = await getProposalDetails(vote.proposalID, proposalC, voterC)

    return { success: true, id: priorvoteID, pid: proposal.id, ...vote }
  }
  catch (e) {
    console.log('userPriorVote::', e.message)
    return { success: false, error: e.message }

  }
}

/**
 * Rollups the vote Data
 * @param {object} body Payload containing voteInformation
 * @returns Json object with success or failure message
 */
const voteDataRollups = async body => {
  const voterC = getVoterContract()
  const proposalC = getProposalContract()
  try {
    const voteID = body.voteID
    if (!voteID) throw new Error('vote ID not present')

    let { voter, proposalID } = await voterC.callSmartContractGetFunc('getVote', [voteID])
    const { voteReplaces } = await voterC.callSmartContractGetFunc('getVoteExtra', [voteID])
    const proposalInfo = await proposalC.callSmartContractGetFunc('getProposal', [proposalID])

    let { userSpecificVotes, proposalVotes, proposalVoters, proposalArchiveVotes } = await voteDataRollupsFile()

    // keep the roll ups record in file
    await updateVoteDataRollups({ userSpecificVotes, proposalVotes, proposalVoters, proposalArchiveVotes }, { voter, voteID, proposalID, voteReplaces }, proposalInfo, voterC)

    //save all the rollups
    await saveVoteRollupsData({ userSpecificVotes, proposalVotes, proposalVoters, proposalArchiveVotes })

    return { success: true, message: 'vote data rollups complete' }
  }
  catch (e) {
    console.log('voteDataRollups::', e.message)
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
        const { voter, voteIsTheft, proposalID, customTheftAmount, comment, date } = vote
        const voteExtra = await contract.callSmartContractGetFunc('getVoteExtra', [parseInt(voteID)])
        const { holon, voteReplaces, voteReplacedBy } = voteExtra

        allVotes.push({
          "id": voteID,
          voter,
          voteType: voteIsTheft,
          "proposal": proposalID,
          altTheftAmt: customTheftAmount,
          comment,
          holon,
          voteReplaces,
          voteReplacedBy,
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
  getAllVoteIds,
  voteDataRollups,
  updateVoteDataRollups,
  saveVoteRollupsData
}
